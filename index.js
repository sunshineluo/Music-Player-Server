// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const nodeID3 = require('node-id3');

const app = express();
const port = 9000;
const musicFolderPath = path.join(__dirname, 'music');
const jsonFilePath = path.join(__dirname, 'music_files.json');   // 新增

app.use(cors({ origin: '*' }));

/* -------------------- 工具函数 -------------------- */
async function handleAlbumCover(title, albumArt, req) {
  if (!albumArt?.imageBuffer) return null;

  const coverFileName = `${title}-cover.jpg`;
  const coverFullPath = path.join(musicFolderPath, coverFileName);

  try {
    await fs.promises.access(coverFullPath);
  } catch {
    await fs.promises.writeFile(coverFullPath, albumArt.imageBuffer);
  }

  return `${req.protocol}://${req.get('host')}/covers/${coverFileName}`;
}

/* 扫描目录并生成 JSON */
async function buildMusicJson(req) {
  const files = await fs.promises.readdir(musicFolderPath);

  const tasks = files
    .filter(f => /\.(mp3|flac)$/i.test(f))
    .map(async file => {
      const title = path.parse(file).name;
      const src   = `${req.protocol}://${req.get('host')}/stream/${file}`;
      const lrc   = `${req.protocol}://${req.get('host')}/lyrics/${title}.lrc`;

      const tags   = nodeID3.read(path.join(musicFolderPath, file));
      const artist = tags.artist || '未知艺术家';
      const album  = tags.album  || '未知专辑';
      const cover  = await handleAlbumCover(title, tags.image, req);

      return { name: title, artist, album, url: src, cover, lrc };
    });

  const list = await Promise.all(tasks);
  await fs.promises.writeFile(jsonFilePath, JSON.stringify(list, null, 2), 'utf-8');
  return list;
}

/* -------------------- 路由 -------------------- */
// 1. 音乐列表
app.get('/api', async (req, res) => {
  try {
    if (req.query.refresh === 'true') {
      const data = await buildMusicJson(req);
      return res.json(data);
    }

    // 优先读缓存
    try {
      await fs.promises.access(jsonFilePath);
      const buf = await fs.promises.readFile(jsonFilePath, 'utf-8');
      return res.json(JSON.parse(buf));
    } catch {
      // 第一次没有文件，现场生成
      const data = await buildMusicJson(req);
      return res.json(data);
    }
  } catch (err) {
    console.error('读取音乐列表失败:', err);
    res.status(500).json({ error: '服务器处理错误' });
  }
});

// 2. 流式播放
app.get('/stream/:filename', async (req, res) => {
  try {
    const file = path.basename(req.params.filename);
    const filePath = path.join(musicFolderPath, file);
    await fs.promises.access(filePath);

    const stat = await fs.promises.stat(filePath);
    const range = req.headers.range;
    const ext = path.extname(file).toLowerCase();
    const mime = ext === '.mp3' ? 'audio/mpeg'
               : ext === '.flac' ? 'audio/flac'
               : 'application/octet-stream';

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end   = endStr ? parseInt(endStr, 10) : stat.size - 1;
      const len   = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': len,
        'Content-Type': mime,
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': mime,
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error('流式播放失败:', err);
    res.status(404).json({ error: '文件未找到' });
  }
});

// 3. 歌词
app.get('/lyrics/:filename', async (req, res) => {
  try {
    const file = path.basename(req.params.filename);
    if (!file.endsWith('.lrc')) return res.status(400).json({ error: '格式不正确' });

    const filePath = path.join(musicFolderPath, file);
    await fs.promises.access(filePath);

    res.set({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
    fs.createReadStream(filePath).on('error', () => res.status(500).json({ error: '读取歌词失败' })).pipe(res);
  } catch {
    res.status(404).json({ error: '歌词文件未找到' });
  }
});

// 4. 封面图
app.use('/covers', express.static(musicFolderPath, {
  setHeaders: res => res.setHeader('Cache-Control', 'public, max-age=86400')
}));

// 5. 前端静态资源
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

/* -------------------- 启动 -------------------- */
app.listen(port, () => {
  console.log(`音乐服务器已启动 http://localhost:${port}`);
});

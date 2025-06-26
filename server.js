const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const nodeID3 = require('node-id3');
const Redis = require('ioredis');
const app = express();
const port = 9000;
const musicFolderPath = path.join(__dirname, 'music');

// Redis 配置
const redis = new Redis({
    host: 'localhost',
    port: 6379,
    db: 5,
});

// CORS 配置
app.use(cors({
    origin: '*'
}));

// 处理专辑封面的异步函数
async function handleAlbumCover(title, albumArt, req) {
    if (!albumArt || !albumArt.imageBuffer) {
        return null;
    }
    
    const coverFileName = `${title}-cover.jpg`;
    const coverPath = path.join(musicFolderPath, coverFileName);
    
    try {
        try {
            await fs.promises.access(coverPath);
        } catch {
            await fs.promises.writeFile(coverPath, albumArt.imageBuffer);
        }
        
        return `${req.protocol}://${req.get('host')}/covers/${coverFileName}`;
    } catch (error) {
        console.error('保存封面图片失败:', error);
        return null;
    }
}

// 音乐文件流式处理路由
app.get('/stream/:filename', async (req, res) => {
    try {
        const filename = path.basename(req.params.filename);
        const filePath = path.join(musicFolderPath, filename);

        // 检查文件是否存在
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
        } catch {
            return res.status(404).json({ error: '音乐文件未找到' });
        }

        const stat = await fs.promises.stat(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        // 获取文件扩展名并设置相应的 Content-Type
        const ext = path.extname(filename).toLowerCase();
        const contentType = ext === '.mp3' ? 'audio/mpeg' : 
                          ext === '.flac' ? 'audio/flac' : 
                          'application/octet-stream';

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = end - start + 1;

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': contentType,
                'Cache-Control': 'no-cache'
            });

            const stream = fs.createReadStream(filePath, { start, end });
            stream.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': contentType,
                'Cache-Control': 'no-cache'
            });
            const stream = fs.createReadStream(filePath);
            stream.pipe(res);
        }
    } catch (error) {
        console.error('流式处理音乐文件失败:', error);
        res.status(500).json({ error: '服务器处理错误' });
    }
});

// 音乐文件列表API
app.get('/api', async (req, res) => {
    try {
        const forceRefresh = req.query.refresh === 'true';
        
        if (!forceRefresh) {
            const cachedData = await redis.get('musicFilesCache');
            if (cachedData) {
                return res.json(JSON.parse(cachedData));
            }
        }

        const files = await fs.promises.readdir(musicFolderPath);
        
        const musicFilesPromises = files
            .filter(file => file.endsWith('.mp3') || file.endsWith('.flac'))
            .map(async file => {
                const title = path.parse(file).name;
                const src = `${req.protocol}://${req.get('host')}/stream/${file}`;
                const lyricsSrc = `${req.protocol}://${req.get('host')}/lyrics/${title}.lrc`;

                const tags = nodeID3.read(path.join(musicFolderPath, file));
                const artist = tags.artist || '未知艺术家';
                const album = tags.album || '未知专辑';
                const coverSrc = await handleAlbumCover(title, tags.image, req);

                return {
                    name: title,
                    artist: artist,
                    album: album,
                    url: src,
                    cover: coverSrc,
                    lrc: lyricsSrc
                };
            });

        const musicFiles = await Promise.all(musicFilesPromises);
        
        await redis.set('musicFilesCache', JSON.stringify(musicFiles));
        return res.json(musicFiles);
    } catch (error) {
        console.error('处理音乐文件失败:', error);
        return res.status(500).json({ error: '服务器处理错误' });
    }
});

// 歌词文件路由
app.get('/lyrics/:filename', async (req, res) => {
    try {
        const filename = path.basename(req.params.filename);

        if (!filename.endsWith('.lrc')) {
            return res.status(400).json({ error: '文件格式不正确' });
        }

        const lyricsFilePath = path.join(musicFolderPath, filename);

        try {
            await fs.promises.access(lyricsFilePath, fs.constants.F_OK);
        } catch {
            return res.status(404).json({ error: '歌词文件未找到' });
        }

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        
        const stream = fs.createReadStream(lyricsFilePath);
        stream.on('error', (error) => {
            console.error('读取歌词文件错误:', error);
            res.status(500).json({ error: '读取歌词文件失败' });
        });
        stream.pipe(res);
    } catch (error) {
        console.error('处理歌词请求错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 封面图片静态服务
app.use('/covers', express.static(musicFolderPath, {
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=86400');
    }
}));

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ error: '服务器内部错误' });
});

// 静态前端页面服务（如 public/index.html）
app.use(express.static(path.join(__dirname, 'public')));

// 默认访问根路径时返回首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});


// 启动服务器
app.listen(port, () => {
    console.log(`音乐服务器已启动 地址：http://localhost:${port}/`);
});
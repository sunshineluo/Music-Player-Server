console.log("\n %c 简约播放器 %c https://github.com/sunshineluo/Music-Player-Server \n", "color: #fadfa3; background: #030307; padding:5px 0;", "background: #fadfa3; padding:5px 0;")

// DOM 缓存
const dom = {
  prevControlls: document.getElementById("prev-controlls"),
  playControlls: document.getElementById("play-controlls"),
  nextControlls: document.getElementById("next-controlls"),
  menuControlls: document.getElementById("menu-controlls"),
  totalTimeEle: document.getElementById("total-time"),
  currentTimeEle: document.getElementById("current-time"),
  currentProgressEle: document.getElementById("current-progress"),
  currentProgressMainEle: document.getElementById("progress-bar-main"),
  audioListPanel: document.getElementById("audio-list-panel"),
  audioListEle: document.getElementById("audio-list"),
  lyricsContainerEle: document.getElementById("lyrics-container"),
  lyricsListEle: document.getElementById("lyrics-list"),
  lyricsTitleEle: document.getElementById("lyrics-title"),
  modeToggleControlls: document.getElementById("mode-toggle-controlls"),
  bgBlurLayer: document.getElementById("bg-blur-layer"),
  toast: document.getElementById("mode-toast")
};

// 样式控制：鼠标靠近底部显示控制栏
if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
  let hideTimer = null;

  function throttle(fn, delay) {
    let timer = null;
    return function (...args) {
      if (timer) return;
      timer = setTimeout(() => {
        fn.apply(this, args);
        timer = null;
      }, delay);
    };
  }

  document.addEventListener("mousemove", throttle((e) => {
    const threshold = 100;
    const fromBottom = window.innerHeight - e.clientY;

    document.body.classList.toggle("show-controls", fromBottom <= threshold);

    if (fromBottom <= threshold) {
      if (hideTimer) clearTimeout(hideTimer);
    } else {
      hideTimer = setTimeout(() => {
        document.body.classList.remove("show-controls");
      }, 50);
    }
  }, 100));
}

// 播放模式控制
let playMode = 'shuffle';
const modeIcons = {
  order: 'fa-list',
  'repeat-one': 'fa-repeat',
  shuffle: 'fa-random'
};

function updatePlayModeIcon() {
  const icon = dom.modeToggleControlls.querySelector("i");
  icon.className = `fa ${modeIcons[playMode]}`;
}

dom.modeToggleControlls.addEventListener("click", () => {
  const modes = ['order', 'repeat-one', 'shuffle'];
  const currentIndex = modes.indexOf(playMode);
  playMode = modes[(currentIndex + 1) % modes.length];
  updatePlayModeIcon();
  showToast(`${playMode === 'order' ? '顺序播放' : playMode === 'repeat-one' ? '单曲循环' : '随机播放'}`);
});

// 音频实例
const audio = new Audio();
let isPlaying = false;
let audioIndex = 0;
let isOpenMenu = false;
let currentLyrics = [];
let currentLyricIndex = 0;
let localMusic = [];
let isCrossfading = false;
const crossfadeDuration = 3;

document.title = '简约音乐播放器';

// 预加载下一首
let nextAudio = new Audio();

function preloadNextTrack() {
  const nextIndex = getNextIndex();
  if (localMusic[nextIndex]) {
    nextAudio.src = localMusic[nextIndex].src;
    nextAudio.load();
  }
}

// 初始化音乐列表
async function fetchAndInitMusic() {
  try {
    const res = await fetch("/api");
    const data = await res.json();

    localMusic = data.map(item => ({
      src: item.url,
      lrc: item.lrc,
      name: item.name,
      cover: item.cover
    }));

    if (localMusic.length === 0) return;

    renderAudioList();
    const randomIndex = Math.floor(Math.random() * localMusic.length);
    loadTrack(randomIndex, false);
    preloadNextTrack();
  } catch (e) {
    console.error("音乐加载失败：", e);
  }
}

fetchAndInitMusic();

// 格式化时间
function formatTime(seconds) {
  if (isNaN(seconds)) return "00:00";
  return new Date(seconds * 1000).toISOString().substring(14, 19);
}

// 更新音频信息
function updateAudioInfo() {
  const { name } = localMusic[audioIndex];
  const dashIndex = name.indexOf(" - ");
  const audioName = dashIndex === -1 ? name : name.substring(0, dashIndex);
  const audioAuthor = dashIndex === -1 ? "" : name.substring(dashIndex + 3);
  const fullTitle = audioAuthor ? `${audioAuthor} - ${audioName}` : audioName;
  dom.lyricsTitleEle.textContent = fullTitle;
  document.title = `${fullTitle} - 简约音乐播放器`;
}

// 通用淡入淡出函数
function fadeAudio(targetVolume, duration = 3000, callback) {
  const startVolume = audio.volume;
  const startTime = performance.now();

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const newVolume = startVolume + (targetVolume - startVolume) * progress;
    audio.volume = Math.max(0, Math.min(1, newVolume)); // 限制在 [0, 1]

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else if (callback) {
      callback();
    }
  }

  requestAnimationFrame(animate);
}

// 交叉淡入淡出播放
async function crossfadeToNext(index) {
  if (isCrossfading) return;
  isCrossfading = true;

  const nextTrack = localMusic[index];
  const tempAudio = new Audio();
  tempAudio.src = nextTrack.src;
  tempAudio.volume = 0;
  tempAudio.load();

  await new Promise((resolve) => {
    tempAudio.oncanplaythrough = () => resolve();
    tempAudio.onerror = () => resolve();
  });

  tempAudio.play();

  const steps = 30;
  const stepTime = (crossfadeDuration * 1000) / steps;
  let step = 0;

  const interval = setInterval(() => {
    step++;
    audio.volume = Math.max(0, 1 - step / steps);
    tempAudio.volume = Math.min(1, step / steps);

    if (step >= steps) {
      clearInterval(interval);

      audio.pause();
      audio.src = tempAudio.src;
      audio.currentTime = tempAudio.currentTime;
      audio.volume = 1;
      audio.play();

      audioIndex = index;
      updateUI(audioIndex);

      isCrossfading = false;
      preloadNextTrack();
    }
  }, stepTime);
}

// 获取下一首索引
function getNextIndex() {
  if (playMode === 'repeat-one') return audioIndex;
  if (playMode === 'shuffle') {
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * localMusic.length);
    } while (newIndex === audioIndex && localMusic.length > 1);
    return newIndex;
  }
  return (audioIndex + 1) % localMusic.length;
}

// 获取上一首索引
function getPrevIndex() {
  if (playMode === 'repeat-one') return audioIndex;
  if (playMode === 'shuffle') {
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * localMusic.length);
    } while (newIndex === audioIndex && localMusic.length > 1);
    return newIndex;
  }
  return (audioIndex - 1 + localMusic.length) % localMusic.length;
}

// 加载指定曲目
function loadTrack(index, autoPlay = false) {
  audioIndex = index;

  const cover = localMusic[audioIndex]?.cover;
  const coverUrl = (typeof cover === "string" && cover.trim() !== "") ? `${cover}?t=${Date.now()}` : '/banner.jpg';

  dom.bgBlurLayer.style.backgroundImage = `url('/banner.jpg')`;
  if (typeof cover === "string" && cover.trim() !== "") {
    dom.bgBlurLayer.style.backgroundImage = `url('${cover}?t=${Date.now()}')`;
  }

  // 提取主色
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.src = coverUrl;
  img.onload = () => {
    const colorThief = new ColorThief();
    const [r, g, b] = colorThief.getColor(img);
    applyDynamicTheme(`rgb(${r}, ${g}, ${b})`);
  };

  audio.src = localMusic[audioIndex].src;

  if (localMusic[audioIndex].lrc) {
    parseLRC(localMusic[audioIndex].lrc).then((lyrics) => {
      currentLyrics = filterLyricsPreferNonChinese(lyrics);
      displayLyrics(currentLyrics);
      currentLyricIndex = 0;
      highlightCurrentLyric(0);
    });
  } else {
    currentLyrics = [];
    dom.lyricsListEle.innerHTML = "<li>No lyrics available.</li>";
  }

  updateAudioInfo();
  highlightCurrentPlaying(audioIndex);
  audio.load();

  if (autoPlay) {
    isPlaying = true;
    dom.playControlls.innerHTML = `<i class="fa fa-solid fa-pause"></i>`;
    audio.play()
      .then(() => enableWakeLock())
      .catch((e) => {
        isPlaying = false;
        dom.playControlls.innerHTML = `<i class="fa fa-play"></i>`;
        console.warn("播放失败:", e);
      });
  } else {
    isPlaying = false;
    dom.playControlls.innerHTML = `<i class="fa fa-play"></i>`;
    document.title = '简约音乐播放器';
  }
}

//动态取色
function applyDynamicTheme(rgbColor) {
  let [r, g, b] = rgbColor.match(/\d+/g).map(Number);

  // 计算亮度
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  // 如果颜色太暗，则提升亮度
  const MIN_BRIGHTNESS = 300; // 可调：目标亮度
  if (brightness < MIN_BRIGHTNESS) {
    const ratio = MIN_BRIGHTNESS / brightness;
    r = Math.min(255, Math.floor(r * ratio));
    g = Math.min(255, Math.floor(g * ratio));
    b = Math.min(255, Math.floor(b * ratio));
  }

  const safeColor = `rgb(${r}, ${g}, ${b})`;

  // 应用主题色
  document.documentElement.style.setProperty('--main-color', safeColor);

  // 应用于歌词高亮
  document.querySelectorAll('.lyric-line.active-lyric').forEach(el => {
    el.style.color = safeColor;
    el.style.textShadow = `0 0 8px ${safeColor}`;
  });
}

// 显示歌词
function displayLyrics(lyrics) {
  dom.lyricsListEle.innerHTML = "";
  lyrics.forEach((lyric, index) => {
    const li = document.createElement("li");
    li.textContent = lyric.text;
    li.dataset.time = lyric.time;
    li.classList.add("lyric-line");
    dom.lyricsListEle.appendChild(li);
  });
}

// 高亮当前歌词
function highlightCurrentLyric(index) {
  document.querySelectorAll(".lyric-line").forEach((line) => {
    line.classList.remove("active-lyric");
  });
  const currentLyricElement = dom.lyricsListEle.children[index];
  if (currentLyricElement) {
    currentLyricElement.classList.add("active-lyric");
    const container = document.querySelector(".lyrics-scroll");
    const offsetTop = currentLyricElement.offsetTop - container.clientHeight / 2;
    container.scrollTo({ top: offsetTop, behavior: "smooth" });
  }
}

// 过滤非中文歌词优先显示
function filterLyricsPreferNonChinese(lyrics) {
  const map = new Map();
  lyrics.forEach(({ time, text }) => {
    if (!map.has(time)) map.set(time, []);
    map.get(time).push(text);
  });
  const filtered = [];
  for (const [time, texts] of map.entries()) {
    const nonChineseText = texts.find(t => !/[\u4e00-\u9fa5]/.test(t));
    filtered.push({ time, text: nonChineseText !== undefined ? nonChineseText : texts[0] });
  }
  return filtered.sort((a, b) => a.time - b.time);
}

// 解析LRC歌词
async function parseLRC(lrcUrl) {
  try {
    const response = await fetch(lrcUrl);
    const text = await response.text();
    const lines = text.split("\n");
    const lyrics = [];
    lines.forEach((line) => {
      const timeTags = [...line.matchAll(/\[(\d{2}):(\d{2})\.(\d+)\]/g)];
      if (timeTags.length === 0) return;
      const lastTag = timeTags[timeTags.length - 1];
      const textStartPos = lastTag.index + lastTag[0].length;
      const lyricText = line.substring(textStartPos).trim();
      if (!lyricText || lyricText.includes("//")) return;
      timeTags.forEach((tag) => {
        const minutes = parseInt(tag[1]);
        const seconds = parseInt(tag[2]);
        const milliseconds = parseInt((tag[3] + "00").slice(0, 3));
        const time = minutes * 60 + seconds + milliseconds / 1000;
        lyrics.push({ time, text: lyricText });
      });
    });
    return lyrics.sort((a, b) => a.time - b.time);
  } catch (e) {
    console.error("解析歌词失败:", e);
    return [];
  }
}

// 音频事件监听
audio.addEventListener("loadedmetadata", () => {
  dom.totalTimeEle.textContent = formatTime(audio.duration);
});

audio.addEventListener("timeupdate", () => {
  if (isCrossfading) return;

  const progress = (audio.currentTime / audio.duration) * 100;
  dom.currentProgressEle.style.width = `${progress}%`;
  dom.currentTimeEle.textContent = formatTime(audio.currentTime);
  updateLyricPosition();
});

audio.addEventListener("ended", () => {
  if (isCrossfading) return;

  const nextIndex = getNextIndex();
  loadTrack(nextIndex, true);
});

// 更新歌词位置
function updateLyricPosition() {
  if (currentLyrics.length === 0) return;
  const now = audio.currentTime;
  const indices = [];
  for (let i = 0; i < currentLyrics.length; i++) {
    if (Math.abs(currentLyrics[i].time - now) < 0.3) {
      indices.push(i);
    } else if (currentLyrics[i].time > now) break;
  }
  if (indices.length === 0) {
    let lastIndex = 0;
    for (let i = 0; i < currentLyrics.length; i++) {
      if (currentLyrics[i].time <= now) lastIndex = i; else break;
    }
    if (lastIndex !== currentLyricIndex) {
      currentLyricIndex = lastIndex;
      highlightCurrentLyric(currentLyricIndex);
    }
    return;
  }
  const nonChineseIndices = indices.filter(i => !/[\u4e00-\u9fa5]/.test(currentLyrics[i].text));
  if (nonChineseIndices.length > 0) {
    if (currentLyricIndex !== nonChineseIndices[0]) {
      currentLyricIndex = nonChineseIndices[0];
      highlightCurrentLyric(currentLyricIndex);
    }
  } else {
    if (currentLyricIndex !== indices[0]) {
      currentLyricIndex = indices[0];
      highlightCurrentLyric(currentLyricIndex);
    }
  }
}

// 渲染播放列表
function renderAudioList() {
  dom.audioListEle.innerHTML = "";
  localMusic.forEach((music, index) => {
    const listItem = document.createElement("li");
    listItem.classList.add("audio-list-item");
    if (index === audioIndex) listItem.classList.add("active");
    listItem.dataset.index = index;

    const dashIndex = music.name.indexOf(" - ");
    const audioName = dashIndex === -1 ? music.name : music.name.substring(0, dashIndex);
    const audioAuthor = dashIndex === -1 ? "" : music.name.substring(dashIndex + 3);

    listItem.innerHTML = `
      <span class="audio-list-name">${audioName}</span>
      <span class="audio-list-author">${audioAuthor}</span>
    `;

    listItem.addEventListener("click", () => {
      loadTrack(index, true);
      highlightCurrentPlaying(index);
    });

    dom.audioListEle.appendChild(listItem);
  });
}

// 高亮当前播放项
function highlightCurrentPlaying(index) {
  document.querySelectorAll(".audio-list-item").forEach((item) =>
    item.classList.remove("active")
  );
  const currentItem = document.querySelector(`.audio-list-item[data-index="${index}"]`);
  if (currentItem) currentItem.classList.add("active");
}

function scrollToCurrentListItem(index) {
  const currentItem = document.querySelector(`.audio-list-item[data-index="${index}"]`);
  if (currentItem) {
    currentItem.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}


// 更新UI
function updateUI(index) {
  updateAudioInfo();
  highlightCurrentPlaying(index);
  if (localMusic[index].lrc) {
    parseLRC(localMusic[index].lrc).then((lyrics) => {
      currentLyrics = filterLyricsPreferNonChinese(lyrics);
      displayLyrics(currentLyrics);
      currentLyricIndex = 0;
      highlightCurrentLyric(0);
    });
  } else {
    currentLyrics = [];
    dom.lyricsListEle.innerHTML = "<li>No lyrics available.</li>";
  }
}

// 显示提示
function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  setTimeout(() => {
    dom.toast.classList.remove("show");
  }, 1500);
}

// 播放按钮点击事件
dom.playControlls.addEventListener("click", async () => {
  if (audio.paused) {
    try {
      audio.volume = 0;
      await audio.play();
      fadeAudio(1, 3000); // 淡入
      isPlaying = true;
      dom.playControlls.innerHTML = `<i class="fa fa-solid fa-pause"></i>`;
      if (document.title === '简约音乐播放器') updateAudioInfo();
      await enableWakeLock();
    } catch (err) {
      console.error("播放失败：", err);
    }
  } else {
    if (document.hidden) {
      // ⛔ 背景标签页时：立刻暂停，无需动画
      audio.volume = 0;
      audio.pause();
    } else {
      // ✅ 前台时：做淡出动画
      fadeAudio(0, 3000, () => {
        audio.pause();
      });
    }

    isPlaying = false;
    document.title = '简约音乐播放器';
    dom.playControlls.innerHTML = `<i class="fa fa-play"></i>`;
    if (silentAudio) silentAudio.pause();
  }

  document.activeElement.blur();
});


// 上一首
dom.prevControlls.addEventListener("click", () => {
  const newIndex = getPrevIndex();
  loadTrack(newIndex, true);
  showToast("上一首");
});

// 下一首
dom.nextControlls.addEventListener("click", () => {
  const newIndex = getNextIndex();
  loadTrack(newIndex, true);
  showToast("下一首");
});

// 菜单按钮
const overlay = document.getElementById("menu-overlay");

dom.menuControlls.addEventListener("click", () => {
  isOpenMenu = !isOpenMenu;

  dom.audioListPanel.classList.toggle("show", isOpenMenu);
  overlay.classList.toggle("show", isOpenMenu);

  if (isOpenMenu) {
    renderAudioList();
    const currentItem = document.querySelector(`.audio-list-item[data-index="${audioIndex}"]`);
    if (currentItem) {
      currentItem.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
});

// 点击遮罩关闭菜单
overlay.addEventListener("click", () => {
  isOpenMenu = false;
  dom.audioListPanel.classList.remove("show");
  overlay.classList.remove("show");
});

overlay.addEventListener("click", () => {
  isOpenMenu = false;
  dom.audioListPanel.classList.remove("show");
  overlay.classList.remove("show");
});



// 进度条点击跳转
dom.currentProgressMainEle.addEventListener("click", (e) => {
  const percent = e.offsetX / dom.currentProgressMainEle.offsetWidth;
  audio.currentTime = percent * audio.duration;
  currentLyricIndex = 0;
  updateLyricPosition();
  if (audio.paused && audio.duration > 0) {
    dom.playControlls.innerHTML = `<i class="fa fa-solid fa-pause"></i>`;
    audio.play().catch((e) => console.error("跳转播放失败:", e));
  }
});

// 键盘快捷键
document.addEventListener("keydown", async (e) => {
  if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
    const modes = ['order', 'repeat-one', 'shuffle'];
    const currentIndex = modes.indexOf(playMode);
    playMode = modes[(currentIndex + 1) % modes.length];
    updatePlayModeIcon();
    showToast(`${playMode === 'order' ? '顺序播放' : playMode === 'repeat-one' ? '单曲循环' : '随机播放'}`);
    return;
  }

  // ✅ Space 始终是播放/暂停
  if (e.key === " ") {
    e.preventDefault();
    if (audio.paused) {
      try {
        audio.volume = 0;
        await audio.play();
        fadeAudio(1, 3000);
        isPlaying = true;
        showToast("播放");
        updateAudioInfo();
        dom.playControlls.innerHTML = `<i class="fa fa-solid fa-pause"></i>`;
        await enableWakeLock();
      } catch (err) {
        console.error("播放失败：", err);
      }
    } else {
      fadeAudio(0, 3000, () => {
        audio.pause();
      });
      isPlaying = false;
      showToast("暂停");
      document.title = '简约音乐播放器';
      dom.playControlls.innerHTML = `<i class="fa fa-play"></i>`;
      if (silentAudio) silentAudio.pause();
    }
    document.activeElement.blur();
    return;
  }

  // ✅ 当播放列表打开时
if (isOpenMenu) {
  if (e.key === "ArrowUp") {
    e.preventDefault();
    const prevIndex = getPrevIndex();
    loadTrack(prevIndex, true);
    highlightCurrentPlaying(prevIndex);   // ✅ 更新列表高亮
    scrollToCurrentListItem(prevIndex);   // ✅ 确保滚动到视口可见
    showToast("上一首");
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    const nextIndex = getNextIndex();
    loadTrack(nextIndex, true);
    highlightCurrentPlaying(nextIndex);   // ✅ 更新列表高亮
    scrollToCurrentListItem(nextIndex);   // ✅ 滚动到视口可见
    showToast("下一首");
  }
  return;
}


  // ✅ 列表关闭时，恢复默认控制逻辑
  switch (e.key) {
    case "ArrowLeft":
      e.preventDefault();
      loadTrack(getPrevIndex(), true);
      showToast("上一首");
      break;

    case "ArrowRight":
      e.preventDefault();
      loadTrack(getNextIndex(), true);
      showToast("下一首");
      break;

    case "ArrowUp":
      e.preventDefault();
      audio.volume = Math.min(1, audio.volume + 0.1);
      showToast(`音量：${Math.round(audio.volume * 100)}%`);
      break;

    case "ArrowDown":
      e.preventDefault();
      audio.volume = Math.max(0, audio.volume - 0.1);
      showToast(`音量：${Math.round(audio.volume * 100)}%`);
      break;
  }

  document.activeElement.blur();
});

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "l") {
    e.preventDefault();  // 防止页面其它默认行为
    const menuBtn = document.getElementById("menu-controlls");
    if (menuBtn) {
      menuBtn.click();  // 打开播放列表
    }
  }
  document.activeElement.blur(); // 清除焦点
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => {
                showToast("进入全屏模式");
            }).catch(err => {
                console.warn("进入全屏失败：", err);
            });
        } else {
            document.exitFullscreen().then(() => {
                showToast("退出全屏模式");
            }).catch(err => {
                console.warn("退出全屏失败：", err);
            });
        }
    }
});

// 防息屏
let wakeLock = null;
let silentAudio = null;

async function enableWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      document.addEventListener('visibilitychange', async () => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      });
      console.log("🟢 屏幕常亮已启用");
    } catch (e) {
      console.warn("Wake Lock 请求失败", e);
    }
  } else {
    if (!silentAudio) {
      silentAudio = new Audio();
      silentAudio.src = "data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAeAAACABpAAD/AACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg";
      silentAudio.loop = true;
      silentAudio.volume = 0;
    }
    try {
      await silentAudio.play();
      console.log("🟡 使用静音音频防止息屏");
    } catch (e) {
      console.warn("静音音频播放失败", e);
    }
  }
}

document.addEventListener("click", enableWakeLock, { once: true });

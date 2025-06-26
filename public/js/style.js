if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    let hideTimer = null;
    document.addEventListener("mousemove", (e) => {
        const threshold = 100;
        const fromBottom = window.innerHeight - e.clientY;

        if (fromBottom <= threshold) {
            if (hideTimer) clearTimeout(hideTimer);
            if (!document.body.classList.contains("show-controls")) {
                document.body.classList.add("show-controls");
            }
        } else {
            hideTimer = setTimeout(() => {
                document.body.classList.remove("show-controls");
            }, 50);
        }
    });
}



// 元素获取
const prevControlls = document.getElementById("prev-controlls");
const playControlls = document.getElementById("play-controlls");
const nextControlls = document.getElementById("next-controlls");
const menuControlls = document.getElementById("menu-controlls");
const TotalTimeEle = document.getElementById("total-time");
const currentTimeEle = document.getElementById("current-time");
const currentProgressEle = document.getElementById("current-progress");
const currentProgressMainEle = document.getElementById("progress-bar-main");
const audioListEle = document.getElementById("audio-list");
const bannerImgBoxEle = document.getElementById("banner-img-box");
const lyricsContainerEle = document.getElementById("lyrics-container");
const lyricsListEle = document.getElementById("lyrics-list");
const lyricsTitleEle = document.getElementById("lyrics-title");

const modeToggleControlls = document.getElementById("mode-toggle-controlls");
let playMode = 'shuffle'; // 初始播放模式

const modeIcons = {
    'order': 'fa-list',
    'repeat-one': 'fa-repeat',
    'shuffle': 'fa-random'
};

function updatePlayModeIcon() {
    const icon = modeToggleControlls.querySelector("i");
    icon.className = `fa ${modeIcons[playMode]}`;
}

modeToggleControlls.addEventListener("click", () => {
    if (playMode === 'order') {
        playMode = 'repeat-one';
    } else if (playMode === 'repeat-one') {
        playMode = 'shuffle';
    } else {
        playMode = 'order';
    }
    updatePlayModeIcon();
});


let isPlaying = false;
let audioIndex = 0;
let isOpenMenu = false;
let showLyrics = true;
let currentLyrics = [];
let currentLyricIndex = 0;
const audio = new Audio();
let localMusic = [];
document.title = '简约音乐播放器';
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
    } catch (e) {
        console.error("音乐加载失败：", e);
    }
}

fetchAndInitMusic();

function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    return new Date(seconds * 1000).toISOString().substring(14, 19);
}

function updateAudioInfo() {
    const { name } = localMusic[audioIndex];
    const dashIndex = name.indexOf(" - ");
    const audioName = dashIndex === -1 ? name : name.substring(0, dashIndex);
    const audioAuthor = dashIndex === -1 ? "" : name.substring(dashIndex + 3);

    const fullTitle = audioAuthor ? `${audioAuthor} - ${audioName}` : audioName;
    lyricsTitleEle.textContent = fullTitle;

    // 同步设置为页面标题
    document.title = `${fullTitle} - 简约音乐播放器`;
}


function loadTrack(index, autoPlay = false) {

    audioIndex = index;
    // 更新背景模糊图（关键，必须放这里且使用最新索引）
    const bgBlurLayer = document.getElementById("bg-blur-layer");
    const cover = localMusic[audioIndex]?.cover;
    bgBlurLayer.style.backgroundImage = `url('/banner.jpg')`; //先默认图
    if (typeof cover === "string" && cover.trim() !== "") {
        bgBlurLayer.style.backgroundImage = `url('${cover}?t=${Date.now()}')`;
    } else {
        bgBlurLayer.style.backgroundImage = `url('/banner.jpg')`;
    }

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
        lyricsListEle.innerHTML = "<li>No lyrics available.</li>";
    }


    updateAudioInfo();
    highlightCurrentPlaying(audioIndex);
    audio.load();

    if (autoPlay) {
        isPlaying = true;
        playControlls.innerHTML = `<i class="fa fa-solid fa-pause"></i>`;
        audio.play().catch((e) => {
            isPlaying = false;
            playControlls.innerHTML = `<i class="fa fa-play"></i>`;
        });
    } else {
        isPlaying = false;
        playControlls.innerHTML = `<i class="fa fa-play"></i>`;
        document.title = '简约音乐播放器';
    }
}


function displayLyrics(lyrics) {
    lyricsListEle.innerHTML = "";
    lyrics.forEach((lyric, index) => {
        const li = document.createElement("li");
        li.textContent = lyric.text;
        li.dataset.time = lyric.time;
        li.classList.add("lyric-line");
        lyricsListEle.appendChild(li);
    });
}

function highlightCurrentLyric(index) {
    document.querySelectorAll(".lyric-line").forEach((line) => {
        line.classList.remove("active-lyric");
    });
    const currentLyricElement = lyricsListEle.children[index];
    if (currentLyricElement) {
        currentLyricElement.classList.add("active-lyric");
        currentLyricElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

function filterLyricsPreferNonChinese(lyrics) {
    const map = new Map();
    lyrics.forEach(({ time, text }) => {
        if (!map.has(time)) {
            map.set(time, []);
        }
        map.get(time).push(text);
    });
    const filtered = [];
    for (const [time, texts] of map.entries()) {
        // 找到非中文的第一条歌词
        const nonChineseText = texts.find(t => !containsChinese(t));
        if (nonChineseText !== undefined) {
            filtered.push({ time, text: nonChineseText });
        } else {
            // 全中文，选第一条
            filtered.push({ time, text: texts[0] });
        }
    }
    // 按时间排序返回
    return filtered.sort((a, b) => a.time - b.time);
}

function containsChinese(text) {
    return /[\u4e00-\u9fa5]/.test(text);
}

function updateLyricPosition() {
    if (currentLyrics.length === 0) return;

    const now = audio.currentTime;

    // 找出当前时间对应的所有歌词索引（差值小于0.3秒视为同一时间）
    const indices = [];
    for (let i = 0; i < currentLyrics.length; i++) {
        if (Math.abs(currentLyrics[i].time - now) < 0.3) {
            indices.push(i);
        } else if (currentLyrics[i].time > now) {
            break;
        }
    }

    if (indices.length === 0) {
        // 没有完全匹配时间的歌词，显示最后一个小于当前时间的歌词
        let lastIndex = 0;
        for (let i = 0; i < currentLyrics.length; i++) {
            if (currentLyrics[i].time <= now) lastIndex = i;
            else break;
        }
        if (lastIndex !== currentLyricIndex) {
            currentLyricIndex = lastIndex;
            highlightCurrentLyric(currentLyricIndex);
        }
        return;
    }

    // 筛选出非中文歌词索引
    const nonChineseIndices = indices.filter(i => !containsChinese(currentLyrics[i].text));

    if (nonChineseIndices.length > 0) {
        // 优先显示第一个非中文歌词
        if (currentLyricIndex !== nonChineseIndices[0]) {
            currentLyricIndex = nonChineseIndices[0];
            highlightCurrentLyric(currentLyricIndex);
        }
    } else {
        // 如果没有非中文歌词，则显示第一个中文歌词
        if (currentLyricIndex !== indices[0]) {
            currentLyricIndex = indices[0];
            highlightCurrentLyric(currentLyricIndex);
        }
    }
}



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

            // ✅ 过滤掉包含 // 的行 有些歌词文件里面有 // 这样的符号
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


audio.addEventListener("loadedmetadata", () => {
    TotalTimeEle.textContent = formatTime(audio.duration);
});

audio.addEventListener("timeupdate", () => {
    const progress = (audio.currentTime / audio.duration) * 100;
    currentProgressEle.style.width = `${progress}%`;
    currentTimeEle.textContent = formatTime(audio.currentTime);
    updateLyricPosition();
});



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
        // Fallback for Safari/iOS
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

// 播放按钮点击逻辑（增强版）
playControlls.addEventListener("click", async () => {
    if (audio.paused) {
        try {
            await audio.play();
            isPlaying = true;
            playControlls.innerHTML = `<i class="fa fa-solid fa-pause"></i>`;
            // 👉 首次播放时补充标题更新
            if (document.title === '简约音乐播放器') {
                updateAudioInfo();
            }
            await enableWakeLock(); // 👉 播放时启用防息屏
        } catch (err) {
            console.error("播放失败：", err);
        }
    } else {
        audio.pause();
        isPlaying = false;
        document.title = '简约音乐播放器';
        playControlls.innerHTML = `<i class="fa fa-play"></i>`;


        // 可选：停止静音音频
        if (silentAudio) silentAudio.pause();
    }
});

// 用户第一次点击页面时启用 Wake Lock
document.addEventListener("click", enableWakeLock, { once: true });

function getNextIndex() {
    if (playMode === 'repeat-one') {
        // 单曲循环，返回当前索引，不切歌
        return audioIndex;
    }
    if (playMode === 'shuffle') {
        let newIndex;
        do {
            newIndex = Math.floor(Math.random() * localMusic.length);
        } while (newIndex === audioIndex && localMusic.length > 1);
        return newIndex;
    } else {
        return (audioIndex + 1) % localMusic.length;
    }
}

function getPrevIndex() {
    if (playMode === 'repeat-one') {
        // 单曲循环，返回当前索引，不切歌
        return audioIndex;
    }
    if (playMode === 'shuffle') {
        let newIndex;
        do {
            newIndex = Math.floor(Math.random() * localMusic.length);
        } while (newIndex === audioIndex && localMusic.length > 1);
        return newIndex;
    } else {
        return (audioIndex - 1 + localMusic.length) % localMusic.length;
    }
}

prevControlls.addEventListener("click", () => {
    const newIndex = getPrevIndex();
    loadTrack(newIndex, true);
});

nextControlls.addEventListener("click", () => {
    const newIndex = getNextIndex();
    loadTrack(newIndex, true);
});


// 播放结束事件，使用函数动态判断 playMode
function handleAudioEnded() {
    if (playMode === 'repeat-one') {
        audio.currentTime = 0;
        audio.play();
    } else if (playMode === 'shuffle') {
        let newIndex;
        do {
            newIndex = Math.floor(Math.random() * localMusic.length);
        } while (newIndex === audioIndex && localMusic.length > 1);
        loadTrack(newIndex, true);
    } else {
        // 顺序播放
        const nextIndex = (audioIndex + 1) % localMusic.length;
        loadTrack(nextIndex, true);
    }
}
audio.addEventListener("ended", handleAudioEnded);


menuControlls.addEventListener("click", () => {
    isOpenMenu = !isOpenMenu;
    if (isOpenMenu) {
        lyricsContainerEle.style.display = "none";
        audioListEle.style.display = "block";
        renderAudioList(); // 先渲染列表

        // 👉 高亮并滚动到当前播放项
        highlightCurrentPlaying(audioIndex);
        const currentItem = document.querySelector(`.audio-list-item[data-index="${audioIndex}"]`);
        if (currentItem) {
            currentItem.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    } else {
        audioListEle.style.display = "none";
        lyricsContainerEle.style.display = "flex";
        highlightCurrentLyric(currentLyricIndex);
    }
});

currentProgressMainEle.addEventListener("click", (e) => {
    const percent = e.offsetX / currentProgressMainEle.offsetWidth;
    audio.currentTime = percent * audio.duration;
    currentLyricIndex = 0;
    updateLyricPosition();

    if (audio.paused && audio.duration > 0) {
        playControlls.innerHTML = `<i class="fa fa-solid fa-pause"></i>`;
        audio.play().catch((e) => console.error("跳转播放失败:", e));
    }
});

function renderAudioList() {
    audioListEle.innerHTML = "";
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
            console.log("点击了歌曲列表项：", index);
            loadTrack(index, true);
            highlightCurrentPlaying(index);
        });

        audioListEle.appendChild(listItem);
    });
}

function highlightCurrentPlaying(index) {
    document.querySelectorAll(".audio-list-item").forEach((item) =>
        item.classList.remove("active")
    );
    const currentItem = document.querySelector(`.audio-list-item[data-index="${index}"]`);
    if (currentItem) currentItem.classList.add("active");
}

function showToast(message) {
    const toast = document.getElementById("mode-toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 1500);
}

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "l") {
    e.preventDefault();  // 防止页面其它默认行为
    const menuBtn = document.getElementById("menu-controlls");
    if (menuBtn) {
      menuBtn.click();  // 触发按钮点击事件，切换列表显示状态
    }
  }
});

document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        if (playMode === 'order') {
            playMode = 'repeat-one';
            showToast("单曲循环");
        } else if (playMode === 'repeat-one') {
            playMode = 'shuffle';
            showToast("随机播放");
        } else {
            playMode = 'order';
            showToast("顺序播放");
        }
        updatePlayModeIcon();
        return;
    }

    switch (e.key) {
        case "ArrowLeft":
            e.preventDefault();
            loadTrack(getPrevIndex(), true);
            showToast("上一首")
            break;
        case "ArrowRight":
            e.preventDefault();
            loadTrack(getNextIndex(), true);
            showToast("下一首")
            break;
        case " ":
            e.preventDefault();
            if (audio.paused) {
                audio.play();
                isPlaying = true;
                 showToast("播放");
                updateAudioInfo();
                playControlls.innerHTML = `<i class="fa fa-solid fa-pause"></i>`;
            } else {
                audio.pause();
                isPlaying = false;
                showToast("暂停");
                document.title = '简约音乐播放器';
                playControlls.innerHTML = `<i class="fa fa-play"></i>`;
            }
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





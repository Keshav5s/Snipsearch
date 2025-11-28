// ===== Snipsearch - script.js (Part 1) =====
const apiKey = "AIzaSyDFliUSc0-bUmwbM1YR4wmQXk5wVgGV6-A";
const cx = "c7621a78e53794892";
const gnewsApiKey = "13463084aadb9cde1f92844c1ba2acc2";
const youtubeApiKey = "AIzaSyBbcXGt0avRivC7fK4rmLovP4FQcmLk3t0";

let currentTab = "all";
let currentPage = 1;
const pageTokenMap = {}; // YouTube pagination tokens

// DOM Elements
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("search-button");
const resultsDiv = document.getElementById("results");
const paginationDiv = document.getElementById("pagination");
const loadingIndicator = document.getElementById("loading");
const errorMessageDiv = document.getElementById("error-message");
const historyDropdown = document.getElementById("history-dropdown");
const historyList = document.getElementById("history-list");
const clearHistoryButton = document.getElementById("clear-history");
const themeToggle = document.getElementById("theme-toggle");

// --- Dark Mode Toggle ---
function initTheme() {
  const isDarkMode = localStorage.getItem('theme') === 'dark';
  if (isDarkMode) {
    document.documentElement.classList.add('dark-mode');
    themeToggle.textContent = '🌙';
  } else {
    document.documentElement.classList.remove('dark-mode');
    themeToggle.textContent = '☀️';
  }
}
initTheme();

themeToggle.addEventListener('click', () => {
  const isDarkMode = document.documentElement.classList.toggle('dark-mode');
  localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  themeToggle.textContent = isDarkMode ? '🌙' : '☀️';
});

// --- Search History ---
function getSearchHistory() {
  const history = localStorage.getItem('searchHistory');
  return history ? JSON.parse(history) : [];
}

function saveSearchHistory(query) {
  const history = getSearchHistory();
  const newHistory = [query, ...history.filter(q => q !== query).slice(0, 4)];
  localStorage.setItem('searchHistory', JSON.stringify(newHistory));
}

function renderSearchHistory() {
  const history = getSearchHistory();
  historyList.innerHTML = '';
  if (history.length > 0) {
    history.forEach(query => {
      const li = document.createElement('li');
      li.className = "py-2 px-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition";
      li.textContent = query;
      li.onclick = () => {
        searchInput.value = query;
        historyDropdown.classList.add('hidden');
        performSearch();
      };
      historyList.appendChild(li);
    });
    historyDropdown.classList.remove('hidden');
  } else {
    historyDropdown.classList.add('hidden');
  }
}

// Input Events
searchInput.addEventListener('input', () => {
  if (searchInput.value.trim().length > 0) {
    searchButton.classList.remove('opacity-0');
  } else {
    searchButton.classList.add('opacity-0');
  }
});
searchInput.addEventListener('focus', renderSearchHistory);
searchInput.addEventListener('blur', () => setTimeout(() => historyDropdown.classList.add('hidden'), 100));
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    performSearch();
    historyDropdown.classList.add('hidden');
  }
});
clearHistoryButton.addEventListener('click', () => {
  localStorage.removeItem('searchHistory');
  historyDropdown.classList.add('hidden');
});

// Tab Switching
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('[id^="tab-"]').forEach(el => {
    el.classList.remove("border-[var(--primary-color)]", "text-[var(--primary-color)]");
    el.classList.add("border-transparent", "text-[var(--text-secondary)]");
  });
  const activeTab = document.getElementById("tab-" + tab);
  if (activeTab) {
    activeTab.classList.add("border-[var(--primary-color)]", "text-[var(--primary-color)]");
  }
  Object.keys(pageTokenMap).forEach(k => delete pageTokenMap[k]); // reset YouTube pagination
  performSearch(1);
}
// ===== Snipsearch - script.js (Part 2) =====
async function performSearch(page = 1) {
  const query = searchInput.value.trim();
  if (!query) {
    resultsDiv.innerHTML = "";
    paginationDiv.innerHTML = "";
    return;
  }

  currentPage = page;
  let resultsHTML = "";
  errorMessageDiv.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');
  resultsDiv.innerHTML = "";
  paginationDiv.innerHTML = "";
  saveSearchHistory(query);

  try {
    let url, data;

    // --- All (Google Custom Search) ---
    if (currentTab === "all") {
      const start = (page - 1) * 10 + 1;
      url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${cx}&start=${start}`;
      const res = await fetch(url);
      data = await res.json();
      if (data.items) {
        data.items.forEach(item => {
          resultsHTML += `
            <div class="mb-6 p-4 rounded-lg shadow-sm bg-[var(--background-color)] border">
              <a href="${item.link}" target="_blank" class="text-xl text-[var(--primary-color)] hover:underline">${item.title}</a>
              <p class="text-sm text-green-600">${item.link}</p>
              <p class="mt-1">${item.snippet || ""}</p>
            </div>`;
        });
      }
    }

    // --- Images ---
    if (currentTab === "images") {
      const start = (page - 1) * 10 + 1;
      url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&searchType=image&key=${apiKey}&cx=${cx}&start=${start}`;
      const res = await fetch(url);
      data = await res.json();
      if (data.items) {
        resultsHTML = `<div class="grid grid-cols-2 md:grid-cols-4 gap-4">`;
        data.items.forEach(img => {
          resultsHTML += `
            <a href="${img.link}" target="_blank" class="block overflow-hidden rounded-lg shadow-md hover:scale-105 transition">
              <img src="${img.link}" alt="${img.title}" class="w-full h-auto object-cover"/>
            </a>`;
        });
        resultsHTML += `</div>`;
      }
    }

    // --- News (GNews API) ---
    if (currentTab === "news") {
      url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&token=${gnewsApiKey}&max=10&page=${page}`;
      const res = await fetch(url);
      data = await res.json();
      if (data.articles) {
        data.articles.forEach(article => {
          resultsHTML += `
            <div class="mb-6 p-4 rounded-lg shadow-sm bg-[var(--background-color)] border">
              <a href="${article.url}" target="_blank" class="text-xl text-[var(--primary-color)] hover:underline">${article.title}</a>
              <p class="text-sm text-green-600">${article.source?.name || ""}</p>
              <p class="mt-1">${article.description || ""}</p>
            </div>`;
        });
      }
    }

    // --- Videos (YouTube API) ---
    if (currentTab === "videos") {
      const pageToken = pageTokenMap[page] || "";
      url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query)}&key=${youtubeApiKey}&pageToken=${pageToken}`;
      const res = await fetch(url);
      data = await res.json();
      if (data.items) {
        pageTokenMap[page + 1] = data.nextPageToken || "";
        pageTokenMap[page - 1] = data.prevPageToken || "";
        data.items.forEach(video => {
          const vid = video.id?.videoId;
          const sn = video.snippet || {};
          if (!vid) return;
          resultsHTML += `
            <div class="mb-6 p-4 rounded-lg shadow-sm bg-[var(--background-color)] border">
              <a href="https://www.youtube.com/watch?v=${vid}" target="_blank" class="text-xl text-[var(--primary-color)] hover:underline">${sn.title}</a>
              <p class="text-sm">${sn.channelTitle || ""}</p>
              <img src="${sn.thumbnails?.medium?.url || ""}" alt="${sn.title}" class="rounded-lg mt-2"/>
            </div>`;
        });
      }
    }

    // --- Wikipedia (NEW) ---
    if (currentTab === "wikipedia") {
      url = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=${encodeURIComponent(query)}&origin=*`;
      const res = await fetch(url);
      data = await res.json();
      if (data.query?.search) {
        data.query.search.forEach(article => {
          const link = `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title)}`;
          resultsHTML += `
            <div class="mb-6 p-4 rounded-lg shadow-sm bg-[var(--background-color)] border">
              <a href="${link}" target="_blank" class="text-xl text-[var(--primary-color)] hover:underline">${article.title}</a>
              <p class="mt-1">${article.snippet || ""}...</p>
            </div>`;
        });
      }
    }

    // Render results
    resultsDiv.innerHTML = resultsHTML;

    if (resultsHTML.trim() === "") {
      errorMessageDiv.textContent = `No results found for "${query}".`;
      errorMessageDiv.classList.remove('hidden');
    }

    // --- Pagination (only for non-Wikipedia tabs) ---
    let paginationHTML = "";
    if (currentTab !== "wikipedia") {
      if (page > 1) paginationHTML += `<button onclick="performSearch(${page-1})" class="px-3 py-1 border rounded-full">Prev</button>`;
      paginationHTML += `<button onclick="performSearch(${page+1})" class="px-3 py-1 border rounded-full">Next</button>`;
    }
    paginationDiv.innerHTML = paginationHTML;

  } catch (error) {
    console.error("Search failed:", error);
    errorMessageDiv.textContent = "Error while searching. Please try again.";
    errorMessageDiv.classList.remove('hidden');
  } finally {
    loadingIndicator.classList.add('hidden');
  }
}

// Expose for HTML
window.performSearch = performSearch;
window.switchTab = switchTab;

// Init
switchTab(currentTab);
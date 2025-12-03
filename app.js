let players = [];
const stats = {};
const history = [];
let timerInterval;
let seconds = 0;
let hopTimeout = null;
let dotsInterval = null;
let startTimestamp = null;
document.getElementById('dateTime').textContent = getDateTime();

// Restore session data if available
if (localStorage.getItem("players")) {
  players = JSON.parse(localStorage.getItem("players"));
  fillAll(); // repopulate dropdowns
}
if (localStorage.getItem("stats")) {
  Object.assign(stats, JSON.parse(localStorage.getItem("stats")));
}
if (localStorage.getItem("history")) {
  history.push(...JSON.parse(localStorage.getItem("history")));
  recalcStats();
  updateScoreboard();
  updateHistory();
  revealHighlights();
}
const savedInput = localStorage.getItem("playerInput");
if (savedInput) {
  document.getElementById('playerInput').value = savedInput;
}



function resetSession() {
  showCustomConfirm("Do you really want to reset all data?", function(userAgreed) {
    if (userAgreed) {
      localStorage.clear();
      location.reload();
    }
  });
}



function parsePlayers() {
    const raw = document.getElementById('playerInput').value;
    players = raw.split(',').map(p => p.trim()).filter(p => p);
    players.forEach(p => { 
      if (!stats[p]) stats[p] = { win: 0, loss: 0, points: 0 };
    });
    localStorage.setItem("playerInput", raw); // Save input text
    localStorage.setItem("players", JSON.stringify(players));
    localStorage.setItem("stats", JSON.stringify(stats));
}



// fill dropdown with player names
function fillAll() {
  const sortedPlayers = [...players].sort(); // Sort alphabetically
  ['teamA1', 'teamA2', 'teamB1', 'teamB2'].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = '';
    sortedPlayers.forEach(p => sel.add(new Option(p, p)));
    sel.disabled = false;
  });
}



function randomizeTeams() {
    let pool = [...players];
    const pick = () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; // after every pick(), the array gets spliced
    const [a1, a2, b1, b2] = [pick(), pick(), pick(), pick()];
    // console.log(pool);
    // then, set the dropdown values
    teamA1.value = a1; teamA2.value = a2;
    teamB1.value = b1; teamB2.value = b2;
}



function updateScoreboard() {
  const tbody = document.getElementById('scoreTable');
  tbody.innerHTML = '';

  const sortedPlayers = [...players].sort((a, b) => {
    const statA = stats[a];
    const statB = stats[b];

    if (statB.win !== statA.win) {
      return statB.win - statA.win; // More wins first
    }

    if (statA.loss !== statB.loss) {
      return statA.loss - statB.loss; // Fewer losses next
    }

    return a.localeCompare(b); // alphabetical order
  });

  sortedPlayers.forEach(p => {
    const s = stats[p];
    const total = s.win + s.loss;
    const wr = total ? ((s.win / total) * 100).toFixed(1) : '0.0';
    tbody.innerHTML += `
      <tr>
        <td class="border border-gray-700 py-2">${p}</td>
        <td class="border border-gray-700 py-2">${s.win}</td>
        <td class="border border-gray-700 py-2">${s.loss}</td>
        <td class="border border-gray-700 py-2">${total}</td>
        <td class="border border-gray-700 py-2">${wr} %</td>
      </tr>
    `;
  });
}



function updateHistory() {
  const tbody = document.getElementById('historyTable');
  tbody.innerHTML = '';

  history.forEach((m, idx) => {
    tbody.innerHTML += `
      <tr data-index="${idx}">
        <td class="border border-gray-700 py-1 text-center">${m.duration}</td>
        <td class="border border-gray-700 py-1 text-center">${m.teamA.join(' & ')}</td>
        <td class="border border-gray-700 py-1 text-center">${m.teamB.join(' & ')}</td>
        <td class="border border-gray-700 py-1 text-center">${m.scoreA} - ${m.scoreB}</td>
        <td class="border border-gray-700 py-1 text-center relative">
          <button onclick="toggleDropdown(${idx})" class="px-2">⋮</button>
          <div id="dropdown-${idx}" class="hidden absolute right-0 mt-1 w-24 bg-gray-800 border border-gray-600 rounded shadow-lg z-10">
            <button onclick="enterEditMode(${idx})" class="block w-full text-left px-2 py-1 hover:bg-gray-700">Edit</button>
            <button onclick="deleteRow(${idx})" class="block w-full text-left px-2 py-1 hover:bg-gray-700 text-red-400">Delete</button>
          </div>
        </td>
      </tr>
    `;
  });
}



function toggleDropdown(index) {
  // Close other dropdowns
  document.querySelectorAll('[id^="dropdown-"]').forEach(dd => {
    if (dd.id !== `dropdown-${index}`) dd.classList.add("hidden");
  });

  const dropdown = document.getElementById(`dropdown-${index}`);
  dropdown.classList.toggle("hidden");
}



// Close dropdowns when clicking outside
document.addEventListener("click", (e) => {
  const clickedMenu = e.target.closest('[id^="dropdown-"]');
  const clickedToggle = e.target.closest('button') && /toggleDropdown\(/.test(e.target.getAttribute('onclick') || '');
  if (!clickedMenu && !clickedToggle) {
    document.querySelectorAll('[id^="dropdown-"]').forEach(dd => dd.classList.add("hidden"));
  }
});



function enterEditMode(index) {
  const row = document.querySelector(`#historyTable tr[data-index="${index}"]`);
  const match = history[index];

  row.innerHTML = `
    <td class="border border-gray-700 py-1"><input type="text" class="w-full bg-transparent text-center inputEdit" value="${match.duration}"></td>
    <td class="border border-gray-700 py-1"><input type="text" class="w-full bg-transparent text-center inputEdit" value="${match.teamA.join(' & ')}"></td>
    <td class="border border-gray-700 py-1"><input type="text" class="w-full bg-transparent text-center inputEdit" value="${match.teamB.join(' & ')}"></td>
    <td class="border border-gray-700 py-1"><input type="text" class="w-full bg-transparent text-center inputEdit" value="${match.scoreA}-${match.scoreB}"></td>
    <td class="border border-gray-700 py-1 text-center">
      <button onclick="saveEdit(${index})" class="text-s" title="Save" style="margin-bottom:3px;">💾</button>
      <button onclick="updateHistory()" class="text-s" title="Cancel">❌</button>
    </td>
  `;
}



function saveEdit(index) {
  const row = document.querySelector(`#historyTable tr[data-index="${index}"]`);
  const inputs = row.querySelectorAll("input");

  const duration = inputs[0].value.trim();
  const teamA = inputs[1].value.split('&').map(p => p.trim()).filter(Boolean);
  const teamB = inputs[2].value.split('&').map(p => p.trim()).filter(Boolean);
  const scoreParts = inputs[3].value.split('-').map(t => t.trim());
  const scoreA = parseInt(scoreParts[0], 10);
  const scoreB = parseInt(scoreParts[1], 10);

  if (teamA.length !== 2 || teamB.length !== 2 || Number.isNaN(scoreA) || Number.isNaN(scoreB) || !/^\d{1,2}:\d{2}$/.test(duration)) {
    showCustomAlert("Please use valid values:\n• Duration mm:ss\n• Team A: A1 & A2\n• Team B: B1 & B2\n• Score: 21-18");
    return;
  }

  const winner = scoreA > scoreB ? 'TeamA' : 'TeamB';
  history[index] = { teamA, teamB, duration, scoreA, scoreB, winner };

  recalcStats(); // rebuild stats from edited history
  localStorage.setItem("history", JSON.stringify(history));
  localStorage.setItem("stats", JSON.stringify(stats));
  localStorage.setItem("players", JSON.stringify(players));

  updateScoreboard();
  updateHistory();
  revealHighlights();
}



function deleteRow(index) {
  const match = history[index];
  const teams = `${match.teamA.join(" & ")} <br>VS<br> ${match.teamB.join(" & ")}`;

  showCustomConfirm(`Are you sure you want to delete this match?<br><small>${teams}</small>`, 
    function(userAgreed) {
    if (userAgreed) {
      history.splice(index, 1);

      // Recalc stats from scratch
      Object.keys(stats).forEach(p => {
        stats[p].win = 0;
        stats[p].loss = 0;
        stats[p].points = 0;
      });

      history.forEach(m => {
        m.teamA.forEach(p => {
          stats[p][m.winner === 'TeamA' ? 'win' : 'loss']++;
          stats[p].points += m.scoreA;
        });
        m.teamB.forEach(p => {
          stats[p][m.winner === 'TeamB' ? 'win' : 'loss']++;
          stats[p].points += m.scoreB;
        });
      });

      localStorage.setItem("history", JSON.stringify(history));
      localStorage.setItem("stats", JSON.stringify(stats));
      recalcStats()
      updateScoreboard();
      updateHistory();
      revealHighlights();
    }
  });
}



function recalcStats() {
  // Collect all players mentioned anywhere (existing + history)
  const all = new Set(players);
  history.forEach(m => {
    [...m.teamA, ...m.teamB].forEach(p => all.add(p));
  });

  // Ensure stats entries exist for everyone in 'all'
  all.forEach(p => {
    if (!stats[p]) stats[p] = { win: 0, loss: 0, points: 0 };
    else { stats[p].win = 0; stats[p].loss = 0; stats[p].points = 0; }
  });

  // Prune stats for players no longer present
  Object.keys(stats).forEach(p => { if (!all.has(p)) delete stats[p]; });

  // Update the players list to match (sorted for neatness)
  const updatedPlayers = Array.from(all).sort((a,b) => a.localeCompare(b));
  players.length = 0;
  players.push(...updatedPlayers);

  // Rebuild stats from history
  history.forEach(m => {
    m.teamA.forEach(p => {
      stats[p][m.winner === 'TeamA' ? 'win' : 'loss']++;
      stats[p].points += m.scoreA;
    });
    m.teamB.forEach(p => {
      stats[p][m.winner === 'TeamB' ? 'win' : 'loss']++;
      stats[p].points += m.scoreB;
    });
  });
}



function resetHopAnimation() {
  if (hopTimeout) {
    clearTimeout(hopTimeout);
    hopTimeout = null;
  }
}



function animateHop() {
  resetHopAnimation();

  const el = document.getElementById("nowPlaying");
  const text = el.textContent;
  el.textContent = "";

  text.split("").forEach((char, index) => {
    const span = document.createElement("span");
    span.textContent = char === " " ? "\u00A0" : char;
    span.classList.add("hop-char");
    span.style.animationDelay = `${index * 0.1}s`;
    el.appendChild(span);
  });

  const totalTime = (text.length * 0.1 + 0.6 + 3) * 1000;
  hopTimeout = setTimeout(animateHop, totalTime);
}



function resetDotsAnimation() {
  if (dotsInterval) {
    clearInterval(dotsInterval);
    dotsInterval = null;
  }
}



function animateDots() {
  resetDotsAnimation();

  const el = document.getElementById("waiting");
  const baseText = el.textContent.replace(/\.*$/, "");
  let dotCount = 0;

  dotsInterval = setInterval(() => {
    dotCount = (dotCount + 1) % 4;
    el.textContent = baseText + ".".repeat(dotCount);
  }, 1000); // __ ms interval
}



newMatchBtn.onclick = () => {
  if (!((document.getElementById('playerInput').value).trim() === '')) {
    parsePlayers();
    if (players.length > 3) {
      fillAll(); 
      randomizeTeams(); 
      resetTimer();
      animateDots();
      document.getElementById('matchSetup').classList.remove('hidden');
      document.getElementById('confirmMatchBtn').classList.remove('hidden');
      document.getElementById('currentMatch').classList.add('hidden');
      document.getElementById('playerSelect').classList.remove('hidden');
    } else {
      showCustomAlert("This is a 2 vs 2... 😐\nMinimum 4 required");
    }
  } else {
    showCustomAlert("Who is playing? 🤨\nPlayer names required");
  }
};



confirmMatchBtn.onclick = () => {
    ['teamA1','teamA2','teamB1','teamB2'].forEach(id => document.getElementById(id).disabled = true);

    // changeStyle
    ['teamA1','teamA2','teamB1','teamB2'].forEach(id => document.getElementById(id).classList.remove('bg-gray-700', 'text-white', 'biomeFont'));
    ['teamA1','teamA2','teamB1','teamB2'].forEach(id => document.getElementById(id).classList.add('bg-gray-800', 'noShow', 'text-xl', 'biomeFont-bold'));
    ['teamA1','teamA2'].forEach(id => document.getElementById(id).classList.add('text-teal-300'));
    document.getElementById('andTeal').classList.add('text-teal-400');
    ['teamB1','teamB2'].forEach(id => document.getElementById(id).classList.add('text-purple-300'));
    document.getElementById('andPurple').classList.add('text-purple-300');

    document.getElementById('newMatchBtn').classList.add('hidden');
    document.getElementById('confirmMatchBtn').classList.add('hidden');
    document.getElementById('currentMatch').classList.remove('hidden');
    document.getElementById('playerSelect').classList.add('hidden');

    document.getElementById('scoreA').classList.remove('hidden');
    document.getElementById('scoreB').classList.remove('hidden');
    document.getElementById('scoreInputs').classList.remove('hidden');

    startTimer();

    // change border colors
    document.getElementById('teamAwrapper').classList.remove('border-gray-500');
    document.getElementById('teamBwrapper').classList.remove('border-gray-500');
    document.getElementById('teamAwrapper').classList.add('border-teal-500');
    document.getElementById('teamBwrapper').classList.add('border-purple-400');

    animateHop(); // Start the animation loop
};



function startTimer() {
  startTimestamp = Date.now();
  document.getElementById('timerDisplay').classList.remove('hidden');

  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    document.getElementById('timerDisplay').textContent = `${m}:${s}`;
  }, 1000);
}



function stopTimer() {
  clearInterval(timerInterval);
  const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
  seconds = elapsed;
}



function resetTimer() {
    stopTimer();
    seconds = 0;
    document.getElementById('timerDisplay').textContent = '00:00';
    document.getElementById('timerDisplay').classList.add('hidden');
}



submitScoreBtn.onclick = () => {
  const scoreA = parseInt(document.getElementById('scoreA').value, 10);
    const scoreB = parseInt(document.getElementById('scoreB').value, 10);

    if (isNaN(scoreA) || isNaN(scoreB)) 
      {
        showCustomAlert("Please input scores... 😐");
      } 
    else 
      {
        resetStyle();
        stopTimer();
        const teamA = [teamA1.value, teamA2.value];
        const teamB = [teamB1.value, teamB2.value];
        const duration = document.getElementById('timerDisplay').textContent;
        const winner = scoreA > scoreB ? 'TeamA' : 'TeamB';

        teamA.forEach(p => {
            stats[p][winner === 'TeamA' ? 'win' : 'loss']++;
            stats[p].points += scoreA;
        });
        teamB.forEach(p => {
            stats[p][winner === 'TeamB' ? 'win' : 'loss']++;
            stats[p].points += scoreB;
        });    

        history.push({ teamA, teamB, winner, duration, scoreA, scoreB });
        localStorage.setItem("stats", JSON.stringify(stats));
        localStorage.setItem("history", JSON.stringify(history));
        updateScoreboard(); 
        updateHistory();
        resetTimer();
        revealHighlights();
      }
}



// Triggers when match history >= 4
function revealHighlights() {
  if (history.length > 3) {
    document.querySelectorAll('.notEnough').forEach(el => {
      el.classList.add('hidden');
    })

    document.getElementById('mvpStats').classList.remove('hidden');
    document.getElementById('mvpName').textContent = getMVP()[0];
    document.getElementById('mvpWinStats').textContent = getMVP()[1] + " wins";
    document.getElementById('mvpWRStats').textContent = getMVP()[2];

    document.getElementById('quickestTime').textContent = getQuickestMatch()[0];
    document.getElementById('quickest1').textContent = getQuickestMatch()[1];
    document.getElementById('quickest2').textContent = getQuickestMatch()[2];

    document.getElementById('longestTime').textContent = getLongestMatch()[0];
    document.getElementById('longest1').textContent = getLongestMatch()[1];
    document.getElementById('longest2').textContent = getLongestMatch()[2];

    document.getElementById('winMargin').classList.remove('hidden');
    document.getElementById('deadlyDuo').textContent = getBiggestPointLead()[0];
    document.getElementById('pointMargin').textContent = getBiggestPointLead()[1] + " points";
    document.getElementById('matchMargin').textContent = getBiggestPointLead()[2];
  }
}



function resetStyle() {
  // reset values
  document.getElementById('scoreA').value = '';
  document.getElementById('scoreB').value = '';
  
  document.getElementById('newMatchBtn').classList.remove('hidden');
  document.getElementById('matchSetup').classList.add('hidden');

  // reset selection
  ['teamA1','teamA2','teamB1','teamB2'].forEach(id => document.getElementById(id).classList.remove('noShow', 'bg-gray-800', 'noShow', 'text-xl', 'biomeFont-bold', 'text-teal-300', 'text-purple-300'));
  ['teamA1','teamA2','teamB1','teamB2'].forEach(id => document.getElementById(id).classList.add('bg-gray-700', 'text-white', 'biomeFont'));
  document.getElementById('andTeal').classList.remove('text-teal-400');
  document.getElementById('andPurple').classList.remove('text-purple-300');

  // change border colors
  document.getElementById('teamAwrapper').classList.remove('border-teal-500');
  document.getElementById('teamBwrapper').classList.remove('border-purple-400');
  document.getElementById('teamAwrapper').classList.add('border-gray-500');
  document.getElementById('teamBwrapper').classList.add('border-gray-500');

  // hidden again
  document.getElementById('scoreA').classList.add('hidden');
  document.getElementById('scoreB').classList.add('hidden');
  document.getElementById('scoreInputs').classList.add('hidden');
}



function getMVP() {
  if (history.length < 4) return "No MVP yet (less than 4 matches played).";

  let maxWins = 0;
  let topPlayers = [];

  // Step 1: Get players with the most wins
  for (const player of players) {
    const s = stats[player];
    if (s.win > maxWins) {
      maxWins = s.win;
      topPlayers = [player];
    } else if (s.win === maxWins) {
      topPlayers.push(player);
    }
  }

  // Early exit: if only one player has the most wins
  if (topPlayers.length === 1) {
    const s = stats[topPlayers[0]];
    const total = s.win + s.loss;
    const wr = total ? (s.win / total) : 0;
    return [topPlayers[0], maxWins, (wr * 100).toFixed(1)];
  }

  // Step 2: Among top players, get highest win rate
  let bestWR = 0;
  let wrFilteredPlayers = [];

  for (const player of topPlayers) {
    const s = stats[player];
    const total = s.win + s.loss;
    const wr = total ? s.win / total : 0;

    if (wr > bestWR) {
      bestWR = wr;
      wrFilteredPlayers = [player];
    } else if (wr === bestWR) {
      wrFilteredPlayers.push(player);
    }
  }

  // Early exit: if only one player has the best win rate
  if (wrFilteredPlayers.length === 1) {
    return [wrFilteredPlayers[0], maxWins, (bestWR * 100).toFixed(1)];
  }

  // Step 3: Among tied players, pick the one who reached maxWins earliest
  let bestPlayer = wrFilteredPlayers[0];
  let earliestMatchIndex = history.length + 1;

  for (const player of wrFilteredPlayers) {
    let winCount = 0;

    for (let i = 0; i < history.length; i++) {
      const match = history[i];
      const isWin =
        (match.winner === 'TeamA' && match.teamA.includes(player)) ||
        (match.winner === 'TeamB' && match.teamB.includes(player));

      if (isWin) {
        winCount++;
        if (winCount === maxWins) {
          if (i < earliestMatchIndex) {
            earliestMatchIndex = i;
            bestPlayer = player;
          }
          break;
        }
      }
    }
  }

  return [bestPlayer, maxWins, (bestWR * 100).toFixed(1)];
}



function getDateTime() {
  const now = new Date();
  const dateTime = now.toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  // Remove commas and reformat
  const parts = dateTime.replaceAll(',', '').split(' ');
  return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]} (${parts.slice(4).join(' ')})`;
}



function showCustomAlert(message) {
  document.getElementById('alertMessage').innerHTML = message.replace(/\n/g, '<br>');
  document.getElementById('customAlert').classList.remove('hidden');
}



function hideCustomAlert() {
  document.getElementById('customAlert').classList.add('hidden');
}



function getSessionData() {
  const tableToCSV = (tableId) => {
    const table = document.getElementById(tableId);
    let csv = '';
    if (!table) return '';

    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const cols = row.querySelectorAll('th, td');
      const rowData = Array.from(cols).slice(0, -1).map(col => `${col.textContent.trim()}`);
      csv += rowData.join('|') + '\n';
    });
    return csv.trim();
  };

  const historyCSV = tableToCSV('historyTable');

  // Copy to clipboard
  navigator.clipboard.writeText(historyCSV).then(() => {
    showCustomAlert("Session data copied to clipboard");
  }).catch(err => {
    showCustomAlert("Failed to copy data");
    console.error("Clipboard error:", err);
  });

}



function showCustomConfirm(message, callback) {
  document.getElementById('confirmMessage').innerHTML = message.replace(/\n/g, '<br>');
  document.getElementById('customConfirm').classList.remove('hidden');

  // Temporary one-time event handlers
  const agreeBtn = document.getElementById('confirmAgreeBtn');
  const cancelBtn = document.getElementById('confirmCancelBtn');

  const cleanup = () => {
    document.getElementById('customConfirm').classList.add('hidden');
    agreeBtn.onclick = null;
    cancelBtn.onclick = null;
  };
  agreeBtn.onclick = () => {
    cleanup();
    callback(true);
  };
  cancelBtn.onclick = () => {
    cleanup();
    callback(false);
  };
}



function getQuickestMatch() {
  if (history.length === 0) return ["No matches yet"];
  let quickest = history[0];
  let minSeconds = durationToSeconds(quickest.duration);
  for (const match of history) {
    const secs = durationToSeconds(match.duration);
    if (secs < minSeconds) {
      minSeconds = secs;
      quickest = match;
    }
  }
  return [formatSeconds(minSeconds), quickest.teamA.join(' & '), quickest.teamB.join(' & ')];
}



function getLongestMatch() {
  if (history.length === 0) return ["No matches yet"];
  let longest = history[0];
  let maxSeconds = durationToSeconds(longest.duration);
  for (const match of history) {
    const secs = durationToSeconds(match.duration);
    if (secs > maxSeconds) {
      maxSeconds = secs;
      longest = match;
    }
  }
  return [formatSeconds(maxSeconds), longest.teamA.join(' & '), longest.teamB.join(' & ')];
}



// Helper function to convert "mm:ss" string to total seconds
function durationToSeconds(duration) {
  const [min, sec] = duration.split(':').map(Number);
  return min * 60 + sec;
}



// Helper function to convert seconds to "X min Y sec"
function formatSeconds(totalSeconds) {
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min} min ${sec} sec`;
}



function getBiggestPointLead() {
  if (history.length === 0) return ["No matches yet"];
  let maxDiff = -1;
  let leadMatch = null;
  let matchIndex = -1;
  let shortestTime = Infinity;
  for (let i = 0; i < history.length; i++) {
    const match = history[i];
    const diff = Math.abs(match.scoreA - match.scoreB);
    const matchTime = durationToSeconds(match.duration);
    if (
      diff > maxDiff ||
      (diff === maxDiff && matchTime < shortestTime)
    ) {
      maxDiff = diff;
      leadMatch = match;
      matchIndex = i + 1;
      shortestTime = matchTime;
    }
  }
  const winningTeam = leadMatch.winner === 'TeamA' ? leadMatch.teamA : leadMatch.teamB;
  return [winningTeam.join(' & '), maxDiff.toString(), matchIndex.toString()];
}
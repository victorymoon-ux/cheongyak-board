/* 내 청약 보드 — data.json 을 읽어 카드·필터·찜·캘린더를 그린다 (바닐라 JS, 의존성 없음) */
(function () {
  "use strict";
  var FAV_KEY = "cheongyak:fav";
  var state = { data: null, fav: loadFav(), open: {}, marks: {}, map: null, mapLayer: null, mapOn: localStorage.getItem("cheongyak:map") !== "0", mode: "owner", facts: null, stations: [], profile: null };
  var MY = { applied: "지원함", docs: "서류 통과", waitlist: "예비번호", won: "당첨", lost: "탈락", gave_up: "포기" };
  var W = ["일", "월", "화", "수", "목", "금", "토"];
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  function loadFav() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch (e) { return []; } }
  function saveFav() { localStorage.setItem(FAV_KEY, JSON.stringify(state.fav)); }
  function isFav(id) { return state.fav.indexOf(id) >= 0; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function won(v) {
    if (v == null) return "[확인 필요]";
    if (v >= 1e8) { var e = Math.floor(v / 1e8), r = Math.round((v % 1e8) / 1e4); return e + "억" + (r ? " " + r.toLocaleString() + "만" : ""); }
    return Math.round(v / 1e4).toLocaleString() + "만";
  }
  function man(v) { return v == null ? null : Math.round(v / 1e4); }
  function py(m2) { return m2 == null ? null : Math.round(m2 / 3.3058 * 10) / 10; }
  function todayISO() { return Schedule.today(new Date()); }
  function fmtD(iso) { if (!iso) return "?"; var d = new Date(iso); return (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + "(" + W[d.getUTCDay()] + ")"; }
  function daysFrom(iso) { return Math.round((new Date(iso) - new Date(todayISO())) / 864e5); }
  function phaseOf(l) { return Schedule.phase(l); }
  function scheduleHTML(l) {
    var rows = Schedule.periods(l).map(function(p) { return '<li><b>' + esc(p.label || '접수') + '</b> · ' + esc(Schedule.range(p)) + (p.note ? '<br>' + esc(p.note) : '') + '</li>'; });
    Schedule.announcements(l).forEach(function(a) { rows.push('<li><b>' + esc(Schedule.label(a)) + '</b> · ' + esc(Schedule.at(a.date, a.time) + (a.after ? ' 이후' : '')) + '</li>'); });
    var source = l.schedule_source;
    return '<div class="schedule"><b>공급유형별 일정 · 한국시간(KST)</b><ul>' + rows.join('') + '</ul>' + (source && /^https:\/\//.test(source) ? '<a href="' + esc(source) + '" target="_blank" rel="noopener">일정 공식 근거 ↗</a>' : '') + '</div>';
  }
  function mineOf(l) {
    var m = state.marks[l.id]; if (!m || !m.status) return null;
    var ph = phaseOf(l); var label = MY[m.status] || m.status;
    if (m.status === "applied" && ph.k === "closed") label = "지원함 → 결과 대기중" + (Schedule.announcements(l).length ? " · " + Schedule.announcements(l).map(function(a) { return Schedule.label(a) + " " + Schedule.at(a.date, a.time) + (a.after ? " 이후" : ""); }).join(" / ") : "");
    return { status: m.status, label: label, memo: m.memo || "" };
  }
  function timeline(l) { return scheduleHTML(l); }
  function dday(l) {
    var ph = phaseOf(l), p = ph.period, end = p.end;
    var d = end ? Math.round((new Date(end) - new Date(todayISO())) / 864e5) : 9999;
    return { t: ph.text + " · " + ph.sub, c: ph.k === "closed" ? "gray" : ph.urgent ? "rose" : "navy", d: d };
  }
  function typeClass(t) { return /민간/.test(t) ? "navy" : /행복|매입|공공|국민|전세|장기/.test(t) ? "mint" : "gray"; }
  function eligChip(l) {
    var label = "자격 확인 필요";
    var c = "amber";
    if (l.status === "neutral") { label = "공고별 자격 확인 필요"; c = "gray"; }
    if (l.status === "rejected") { label = (l.status_reasons[0] || "탈락"); c = "rose"; }
    if (l.status === "closed") { label = "접수 종료"; c = "gray"; }
    return '<span class="chip ' + c + '">' + esc(label) + "</span>";
  }
  function payKpi(l) {
    if (l.status === "neutral") return '<div class="kpi"><div class="l">월 비용 예시</div><div class="v">—<small>조건 입력 후</small></div></div>';
    var m = l.monthly || {}, v = m.display_total;
    var cls = m.verdict === "ok" ? "mint" : m.verdict === "border" ? "warn" : m.verdict === "over" ? "bad" : "";
    var txt = v == null ? "—" : man(v).toLocaleString();
    var small = v == null ? "미산정" : (m.verdict === "unknown" ? "만원 (금리 미설정)" : "만원");
    return '<div class="kpi ' + cls + '"><div class="l">월 비용 예시</div><div class="v">' + txt + "<small>" + small + "</small></div></div>";
  }
  function transitKpi(l) {
    if (l.status === "neutral") return '<div class="kpi mint"><div class="l">직장까지</div><div class="v">—<small>조건 입력 후</small></div></div>';
    var v = l.transit_min == null ? "—" : l.transit_min;
    var small = l.transit_min == null ? "미산정" : (l.transit_mode === "estimate" ? "분(추정)" : "분");
    var wl = state.mode === "static" && state.profile && state.profile.work && state.profile.work.station ? state.profile.work.station + "까지" : "을지로입구까지";
    return '<div class="kpi mint"><div class="l">' + esc(wl) + '</div><div class="v">' + v + "<small>" + small + "</small></div></div>";
  }
  function area(l) {
    if (l.area_m2_max == null) return "평수 [확인 필요]";
    var a = l.area_m2_min != null && l.area_m2_min !== l.area_m2_max ? py(l.area_m2_min) + "~" + py(l.area_m2_max) : py(l.area_m2_max);
    return "전용 " + a + "평";
  }
  function applicableUnits(l) {
    if (l.units_youth == null && l.units_general == null) return (/추가모집|잔여/.test(l.name || "")) ? null : l.units_total;   // 추가·잔여 모집은 단지 전체 세대수를 모집 호수로 안 씀
    return (l.units_youth || 0) + (l.units_general || 0);
  }
  function unitsText(l) {
    var p = [];
    if (l.units_youth != null) p.push("청년 " + l.units_youth + "호");
    if (l.units_general != null) p.push("일반 " + l.units_general + "호");
    if (l.units_total != null) p.push("전체 " + l.units_total + "세대");
    return p.length ? p.join(" · ") : "모집호수 [확인 필요]";
  }
  function isBig(l) { var n = applicableUnits(l); return n != null && n >= BIG_UNITS; }
  function starName(l) { return (isBig(l) ? "⭐ " : "") + l.name; }
  function watchBadge(l) { return l.watch ? '<span class="chip watch" title="관심 단지 키워드 일치 (config/watch_keywords.json)">💜 관심 단지</span>' : ""; }
  function bigBadge(l) {
    if (isBig(l)) return '<span class="chip big" title="청년+일반 모집 100호 이상 — 예비번호가 많이 돌아 기회가 큼. 조건에 걸려도 무조건 지원">⭐ 대형 모집 ' + applicableUnits(l) + "호 · 무조건 지원</span>";
    if (l.units_total != null && l.units_total >= BIG_COMPLEX) return '<span class="chip big" title="단지 전체 ' + l.units_total + '세대 대단지">대단지 ' + l.units_total + "세대</span>";
    return "";
  }
  function scoreTip(l) {
    var sc = l.score || {};
    return "총점 " + (sc.total || 0) + " = 직장까지 거리 " + (sc.transit || 0) + "/40 + 평수·룸 " + (sc.area || 0) + "/25 + 모집호수 " + (sc.units || 0) + "/15 + 선호 지역 " + (sc.gu || 0) + "/10 + 거주기간 " + (sc.years || 0) + "/10 + 보너스 " + (sc.bonus || 0) + " (2호선 역세권 +5, 1.5룸 +5, 2룸 +8, 대단지 +2)";
  }
  function card(l) {
    var dd = dday(l); var ph = phaseOf(l); var mine = mineOf(l);
    var sc = l.score || {};
    var units = unitsText(l);
    var loc = [l.gu || "구 [확인 필요]", l.station ? l.station + "역 " + (l.station_lines || []).map(function (x) { return /^\d+$/.test(x) ? x + "호선" : x; }).join("·") + (l.station_walk_min != null ? " 도보 " + l.station_walk_min + "분" : "") : ""].filter(Boolean).join(" · ");
    var rooms = l.rooms ? l.rooms + (l.rooms_guessed ? "(추정)" : "") : null;
    var cls = "card " + l.status + (isBig(l) ? " big" : "") + (state.open[l.id] ? " open" : "") + (mine ? " mine" : "");
    var notes = (sc.notes || []).join(", ");
    return '<article class="' + cls + '" data-id="' + esc(l.id) + '">' +
      '<div class="hd"><div class="row"><span class="pill ' + ph.k + (ph.urgent ? " urgent" : "") + '">' + esc(ph.text) + "</span>" + (mine ? '<span class="pill mine">' + esc(mine.label) + "</span>" : "") + '<span class="chip ' + typeClass(l.type) + '">' + esc(l.type) + "</span>" + bigBadge(l) + watchBadge(l) + (l.is_new ? '<span class="chip">신규</span>' : "") + "</div>" +
      '<button class="heart' + (isFav(l.id) ? " on" : "") + '" type="button" aria-pressed="' + isFav(l.id) + '" aria-label="찜" data-fav="' + esc(l.id) + '">♥</button></div>' +
      "<div><h3><button type=\"button\" data-toggle=\"" + esc(l.id) + "\">" + esc(starName(l)) + "</button></h3><div class=\"loc\">" + esc(loc) + " · " + esc(l.provider) + "</div></div>" +
      '<div class="phase"><div class="line">' + esc(ph.sub) + "</div>" + timeline(l) + "</div>" +
      '<div class="kpis">' + transitKpi(l) + payKpi(l) + "</div>" +
      '<div class="row"><span class="chip">' + esc(area(l)) + "</span>" + (rooms ? '<span class="chip">' + esc(rooms) + "</span>" : "") +
      '<span class="chip">보증금 ' + esc(won(l.deposit_won)) + " / 월세 " + esc(won(l.rent_won)) + "</span>" +
      '<span class="chip">' + esc(units) + "</span>" + (l.max_years ? '<span class="chip' + (l.max_years < SHORT_YEARS ? ' rose" title="거주 가능 기간이 짧음 (' + SHORT_YEARS + '년 미만)' : '"') + '>최장 ' + l.max_years + "년" + (l.max_years < SHORT_YEARS ? " · 짧음" : "") + "</span>" : l.end_year ? '<span class="chip' + ((l.end_year - new Date().getFullYear()) < SHORT_YEARS ? ' rose" title="임대 종료가 가까움' : '"') + '>임대 종료 ' + l.end_year + "년</span>" : '<span class="chip gray" title="공고문에 최장 거주기간이 없음 — 보통 2년 단위 재계약">거주기간 [확인 필요]</span>') + "</div>" +
      '<div class="ft">' + eligChip(l) + '<span class="row"><a class="btn primary" href="' + esc(l.source_url) + '" target="_blank" rel="noopener" title="공고·신청 페이지 열기">바로가기 ↗</a><span class="score" title="' + esc(scoreTip(l)) + '">추천 점수 <b>' + (sc.total || 0) + "</b>/100</span></span></div>" +
      '<div class="mine-row"><label>내 상태 <select data-mark="' + esc(l.id) + '"><option value="">미지원</option>' + Object.keys(MY).map(function (k) { return '<option value="' + k + '"' + (mine && mine.status === k ? " selected" : "") + ">" + MY[k] + "</option>"; }).join("") + "</select></label>" +
      '<input type="text" data-memo="' + esc(l.id) + '" placeholder="메모 (예: 예비 23번, 10/3 이메일 접수)" value="' + esc(mine ? mine.memo : "") + '"></div>' +
      '<div class="detail">' +
      '<div class="kv"><b>점수 내역</b><span>거리 ' + (sc.transit || 0) + " · 지역 " + (sc.gu || 0) + " · 평수 " + (sc.area || 0) + " · 거주기간 " + (sc.years || 0) + " · 모집호수 " + (sc.units || 0) + " · 보너스 " + (sc.bonus || 0) + (notes ? " (" + esc(notes) + ")" : "") + "</span>" +
      "<b>교통</b><span>" + esc(l.transit_detail || (l.status === "neutral" ? "내 조건(직장 역)을 입력하면 계산" : "미산정 — 주소 지오코딩 실패 또는 주소 없음")) + "</span>" +
      "<b>월 납입</b><span>" + payDetail(l) + ((l.monthly || {}).alt ? "<br>전환안: " + esc(l.monthly.alt.note) : "") + "</span>" +
      "<b>자격</b><span>" + esc(l.eligibility_note || (l.status === "neutral" ? "내 조건 입력 후 판정" : "미판정")) + "</span>" +
      (l.convert_note ? "<b>전환</b><span>" + esc(l.convert_note) + "</span>" : "") +
      (l.status_reasons && l.status_reasons.length ? "<b>판정</b><span>" + esc(l.status_reasons.join("; ")) + "</span>" : "") +
      (l.movein ? "<b>입주</b><span>" + esc(l.movein) + "</span>" : "") +
      (l.address ? "<b>주소</b><span>" + esc(l.address) + "</span>" : "") + "</div>" +
      (l.sites && l.sites.length ? "<div><b>주택 " + l.sites.length + "곳</b> (지도에 집 단위로 표시)<pre>" + esc(l.sites.map(function (s) { return (s.address || "").replace("서울특별시 ", "") + (s.deposit_won != null ? " · 전세 " + won(s.deposit_won) : "") + (s.area_m2 ? " · " + py(s.area_m2) + "평" : ""); }).join("\n")) + "</pre></div>" : "") +
      eligibilityHTML(l) +
      (l.apply_note ? "<pre>" + esc(l.apply_note) + "</pre>" : "") +
      '<div class="row">' + (l.pdf_url ? '<a class="btn primary" href="' + esc(l.pdf_url) + '" target="_blank" rel="noopener">공고문 PDF</a>' : "") +
      '<a class="btn" href="' + esc(l.source_url) + '" target="_blank" rel="noopener">공고 페이지</a>' +
      '<span class="chip gray">' + esc(l.id) + "</span></div>" +
      "</div></article>";
  }
  function eligibilityHTML(l) {
    var checks = l.eligibility_checks || Engine.eligibilityChecks(l, state.profile || {});
    return '<details class="eligibility-checks"><summary>공급유형별 자격 확인 필요</summary>' + checks.map(function(c) { return '<b>' + esc(c.supply) + '</b><ul>' + c.checks.map(function(t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>'; }).join('') + '</details>';
  }
  function payDetail(l) {
    var m = l.monthly || {};
    if (l.status === "neutral") return "내 조건을 입력하면 비용 예시 계산";
    var text = m.display_total == null ? "보증금·월세·자기자금·은행 금리 확인 필요" : "월세 + 입력한 일반은행 금리의 이자 예시 · 대출 승인/한도 미확인 · 서울시 이자지원 자동 할인 없음";
    if (state.profile && state.profile.seoul_support) text += " · " + Engine.supportChecks(l, state.profile).join(" / ");
    return esc(text);
  }

  function filters() {
    var types = $$("#types input:checked").map(function (i) { return i.value; });
    return {
      view: ($("input[name=view]:checked") || {}).value || "due",
      q: ($("#q").value || "").trim().toLowerCase(),
      types: types, minPy: parseFloat($("#minPy").value) || 0, maxPay: parseFloat($("#maxPay").value) || 0,
      gu: $("#gu").value, line2: $("#line2").checked, newOnly: $("#newOnly").checked, showClosed: $("#showClosed").checked, showOutside: !!($("#showOutside") && $("#showOutside").checked)
    };
  }
  function okOrBig(l) { if (l.status === "neutral") return true; return l.status === "passed" || l.status === "border" || ((isBig(l) || l.watch) && l.status !== "closed"); }
  function visible(l, f) {
    if (l.region_points === null && l.status === "rejected" && !f.showOutside && !mineOf(l)) return false;   // 내 지역 목록 밖
    if (f.q) {
      var hay = [l.name, l.gu, l.station, l.type, l.provider, l.address].join(" ").toLowerCase();
      if (hay.indexOf(f.q) < 0) return false;
    }
    if (f.types.length && f.types.indexOf(l.type) < 0) return false;
    if (f.gu && l.gu !== f.gu) return false;
    if (f.newOnly && !l.is_new) return false;
    if (f.line2 && !((l.station_lines || []).indexOf("2") >= 0 && l.station_walk_min != null && l.station_walk_min <= 10)) return false;
    if (l.status === "closed" && !f.showClosed && f.view !== "fav" && f.view !== "mine") return false;
    var pay = (l.monthly || {}).display_total;
    switch (f.view) {
      case "open": return okOrBig(l) && phaseOf(l).k === "open";
      case "upcoming": return (okOrBig(l) || l.status === "unscored") && phaseOf(l).k === "upcoming";
      case "mine": return !!mineOf(l);
      case "reco": return okOrBig(l) && (isBig(l) || ((l.area_m2_max == null || py(l.area_m2_max) >= f.minPy) && (pay == null || man(pay) <= f.maxPay)));
      case "fav": return isFav(l.id);
      case "edge": return l.status === "border" || l.status === "unscored";
      default: return true;
    }
  }
  function sortFor(view) {
    if (view === "open") return function (a, b) { return (a.apply_end || "9").localeCompare(b.apply_end || "9") || (b.score.total - a.score.total); };
    if (view === "upcoming") return function (a, b) { return (a.apply_start || "9").localeCompare(b.apply_start || "9") || (b.score.total - a.score.total); };
    if (view === "mine") return function (a, b) { return (a.apply_end || "9").localeCompare(b.apply_end || "9"); };
    return function (a, b) { return (b.score.total - a.score.total) || (((a.monthly || {}).display_total || 1e12) - ((b.monthly || {}).display_total || 1e12)); };
  }
  var TITLES = { open: "접수 중 · 지금 신청 가능 (마감 임박순)", upcoming: "접수 예정 (시작일순)", mine: "내 지원 현황", reco: "추천 순", fav: "찜한 집", edge: "경계·미산정 (값을 더 알아야 판단 가능)", all: "전체" };

  function render() {
    var d = state.data, f = filters();
    var all = d.listings.slice();
    var counts = { open: 0, upcoming: 0, mine: 0, reco: 0, fav: 0, edge: 0, all: 0 };
    all.forEach(function (l) {
      var base = Object.assign({}, f);
      ["open", "upcoming", "mine", "reco", "fav", "edge", "all"].forEach(function (v) { base.view = v; if (visible(l, base)) counts[v]++; });
    });
    Object.keys(counts).forEach(function (k) { var el = $('[data-cnt="' + k + '"]'); if (el) el.textContent = counts[k]; });
    var list = all.filter(function (l) { return visible(l, f); }).sort(sortFor(f.view));
    $("#secTitle").textContent = TITLES[f.view] || f.view;
    $("#secCnt").textContent = list.length + "건";
    var hiddenOutside = state.profile ? all.filter(function (l) { return l.region_points === null; }).length : 0;
    $("#grid").innerHTML = list.length ? list.map(card).join("") : '<div class="empty">조건에 맞는 공고가 없어요. 필터를 풀어보세요.' +
      (hiddenOutside ? "<br><small>내 지역 목록 밖이라 숨긴 공고 " + hiddenOutside + "건 — 수집 범위: 서울·인천·경기 (LH·SH·청년안심·청약홈·iH·GH). 왼쪽 '내 지역 밖도 보기'로 확인 가능</small>" : "") + "</div>";
    var base = all.filter(function (l) { return visible(l, Object.assign({}, f, { view: "all" })); });   // 캘린더·지도는 '보기' 선택과 무관
    renderTodo(all);
    renderSummary(all);
    renderCal(base);
    renderMap(base);
  }
  // 월별 공고 흐름 (scripts/seasonality.py 가 만든 seasonality.json). 행 = 묶음, keys = 집계 유형명
  var SEASON_ROWS = [
    { org: "SH", label: "행복주택", keys: ["SH 행복주택"], big: true },
    { org: "SH", label: "청년안심 공공", keys: ["SH 청년안심(공공)", "청년안심 공공·최초"], big: true },
    { org: "SH", label: "장기전세", keys: ["SH 장기전세"], big: true },
    { org: "SH", label: "국민임대", keys: ["SH 국민임대"], big: true },
    { org: "SH", label: "매입임대(청년)", keys: ["SH 매입임대(청년 포함)"], big: true },
    { org: "SH", label: "잔여·사회주택", keys: ["SH 잔여세대", "SH 사회주택", "SH 재개발임대"] },
    { org: "LH", label: "서울 청년매입·행복", keys: ["LH 매입임대(청년)", "LH 행복주택", "LH 통합공공임대", "LH 매입임대"], partial: true },
    { org: "민간", label: "청년안심 최초", keys: ["청년안심 민간·최초"] },
    { org: "민간", label: "청년안심 추가", keys: ["청년안심 민간·추가"] }
  ];
  function renderSeason(s) {
    var el = $("#season"); if (!el) return;
    var now = new Date().getMonth();
    var M = s.months || {};
    var rows = SEASON_ROWS.map(function (r) {
      var arr = [0,0,0,0,0,0,0,0,0,0,0,0];
      r.keys.forEach(function (k) { (M[k] || []).forEach(function (c, i) { arr[i] += c; }); });
      return { r: r, arr: arr, max: Math.max.apply(null, arr), sum: arr.reduce(function (a, b) { return a + b; }, 0) };
    }).filter(function (x) { return x.sum > 0; });
    var head = "<tr><th></th>" + [1,2,3,4,5,6,7,8,9,10,11,12].map(function (m, i) { return '<th class="' + (i === now ? "now" : "") + '">' + m + "</th>"; }).join("") + "</tr>";
    var body = rows.map(function (x) {
      return '<tr><td class="lb" title="' + esc(x.r.org + " " + x.r.label) + " · 총 " + x.sum + "건" + (x.r.partial ? " (LH는 2026년 확인분만)" : "") + '"><span class="org ' + (x.r.org === "SH" ? "sh" : x.r.org === "LH" ? "lh" : "pv") + '">' + esc(x.r.org) + "</span>" + esc(x.r.label) + (x.r.partial ? "*" : "") + "</td>" +
        x.arr.map(function (c, i) {
          var a = x.max ? c / x.max : 0, peak = x.r.big && c > 0 && c >= x.max * 0.6;
          var bg = c ? "rgba(47,111,237," + (0.18 + 0.72 * a).toFixed(2) + ")" : "#fff";
          return '<td class="c' + (i === now ? " now" : "") + (peak ? " peak" : "") + '" style="background:' + bg + '" title="' + (i + 1) + "월 " + c + "건" + (peak ? " · 집중" : "") + '"></td>';
        }).join("") + "</tr>";
    }).join("");
    // 집중 달 요약: big 행에서 peak 달 모으기
    var focus = {};
    rows.forEach(function (x) { if (!x.r.big) return; x.arr.forEach(function (c, i) { if (c > 0 && c >= x.max * 0.6) (focus[i] = focus[i] || []).push(x.r.org + " " + x.r.label); }); });
    var fl = Object.keys(focus).map(Number).sort(function (a, b) { return a - b; }).map(function (i) { return "<b>" + (i + 1) + "월</b> " + focus[i].join("·"); }).join(" / ");
    el.innerHTML = "<h4>월별 공고 흐름</h4><div class='sub'>SH·청년안심 실제 공고일 " + esc((s.years || []).join("~")) + " 집계. 진할수록 많이 뜸, ★ 집중 달</div>" +
      "<table>" + head + body + "</table>" +
      "<div class='focus'>집중할 달: " + (fl || "데이터 부족") + "</div>" +
      "<div class='legend2'><span class='org sh'>SH</span>서울주택도시공사 · <span class='org lh'>LH</span>한국토지주택공사 · <span class='org pv'>민간</span>청년안심주택 민간사업자. 빨간 테두리 = 이번 달. * LH는 목록이 최근 것만 보여 2026년 확인분만.</div>";
  }
  // ---------- 전화 체크리스트 ----------
  function loadCallsLocal() { try { return JSON.parse(localStorage.getItem("cheongyak:calls") || "{}"); } catch (e) { return {}; } }
  function saveCall(id, called, memo) {
    if (state.mode === "static") { var c = loadCallsLocal(); c[id] = { called: !!called, memo: memo || "", updated: todayISO() }; localStorage.setItem("cheongyak:calls", JSON.stringify(c)); state.calls = c; renderPhoneList(); return; }
    fetch("/api/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id, called: !!called, memo: memo || "" }) })
      .then(function (r) { return r.json(); }).then(function (j) { if (j.ok) { state.calls = j.calls; renderPhoneList(); } }).catch(function () {});
  }
  function renderNews(items) {
    var el = $("#news"); if (!el) return;
    items = items || [];
    if (!items.length) { el.innerHTML = ""; return; }
    var t = todayISO(), cutoff = new Date(t); cutoff.setDate(cutoff.getDate() - 7); cutoff = cutoff.toISOString().slice(0, 10);
    var cutoff30 = new Date(t); cutoff30.setDate(cutoff30.getDate() - 30); cutoff30 = cutoff30.toISOString().slice(0, 10);
    var labels = { blog: "블로그", cafe: "카페", vertium: "베르디움 회원공지" };
    el.innerHTML = "<h2>📰 잔여세대(공실) 소식 <small style='font-size:12.5px;color:var(--ink2);font-weight:600'>네이버 블로그·카페 검색을 매일 모음 · 선착순(잔여세대) 1순위 전략용 · 후기·대행 광고도 섞여 있으니 날짜와 출처 확인</small></h2><ul>" +
      items.slice(0, 40).map(function (n) {
        var recent = (n.first_seen || "") >= cutoff && (!n.date || n.date.length < 7 || n.date >= cutoff30);   // 처음 본 지 7일 + 글 자체도 30일 이내일 때만 NEW
        return "<li>" + (recent ? "<span class='new'>NEW</span>" : "<span></span>") +
          "<span class='src " + esc(n.review ? "review" : (n.source || "")) + "'>" + esc(n.review ? "후기(확인됨)" : (labels[n.source] || n.source || "")) + "</span>" +
          "<a href='" + esc(n.url) + "' target='_blank' rel='noopener'>" + esc(n.title) + "</a><span class='d'>" + esc(n.date || "") + "</span></li>";
      }).join("") + "</ul>";
  }
  function renderPhoneList() {
    var el = $("#calls"); if (!el) return;
    var cfg = state.complexes || { ask: "", complexes: [] }, calls = state.calls || {};
    if (!cfg.complexes.length) { el.innerHTML = ""; return; }
    var done = cfg.complexes.filter(function (c) { return calls[c.id] && calls[c.id].called; }).length;
    el.innerHTML = "<h2>📞 전화·준비 체크리스트 <small style='font-size:12.5px;color:var(--ink2);font-weight:600'>" + done + "/" + cfg.complexes.length + " 완료 · 공실(잔여세대) 선착순은 단지 홈페이지 회원 전용인 곳이 많음 → 미리 가입·연습 · 전화는 평일 낮</small></h2>" +
      '<div class="ask"><b>물어볼 것</b> ' + esc(cfg.ask) + "</div>" +
      "<table><colgroup><col class=\"c-num\"><col class=\"c-name\"><col class=\"c-type\"><col class=\"c-how\"><col class=\"c-tel\"><col class=\"c-hours\"><col class=\"c-chk\"><col class=\"c-memo\"></colgroup><thead><tr><th></th><th>단지</th><th>타입·비고</th><th>공실(잔여세대) 모집 경로</th><th>전화</th><th>운영시간</th><th>전화함</th><th>메모</th></tr></thead><tbody>" +
      cfg.complexes.map(function (c, i) {
        var s = calls[c.id] || {};
        return '<tr class="' + (s.called ? "done" : "") + '"><td><span class="num">' + (i + 1) + '</span></td><td><div class="nm">' + esc(c.name) + "</div><div class='sub'>" + esc(c.station) + " · " + esc(c.units) + "</div>" + (c.web ? "<div class='sub'><a href='" + esc(c.web.split(" ")[0]) + "' target='_blank' rel='noopener'>" + esc(c.web) + "</a></div>" : "") + "</td>" +
          "<td><div>" + esc(c.types) + "</div>" + (c.note ? "<div class='sub'>" + esc(c.note) + "</div>" : "") + "</td>" +
          "<td class='sub'>" + (c.vacancy_url ? "<a href='" + esc(c.vacancy_url) + "' target='_blank' rel='noopener'>" + esc(c.vacancy_url.replace(/^https?:\/\//, "")) + "</a><br>" : "") + esc(c.vacancy_how || "") + "</td>" +
          "<td>" + (c.tel ? '<a class="tel" href="tel:' + esc(c.tel.replace(/-/g, "")) + '">' + esc(c.tel) + "</a>" : "<span class='sub'>—</span>") + "</td><td class='sub'>" + esc(c.hours) + "</td>" +
          '<td class="chk"><input type="checkbox" data-called="' + esc(c.id) + '"' + (s.called ? " checked" : "") + '>' + (s.updated ? "<div class='sub'>" + esc(s.updated) + "</div>" : "") + "</td>" +
          '<td><input type="text" data-callmemo="' + esc(c.id) + '" value="' + esc(s.memo || "") + '" placeholder="예: 10/14 통화, 공실 없음, 대기명단 등록"></td></tr>';
      }).join("") + "</tbody></table>";
  }
  function renderTodo(all) {
    var t = todayISO();
    var items = all.filter(function (l) {
      if (!(l.status === "passed" || l.status === "border" || l.status === "unscored" || ((isBig(l) || l.watch) && l.status !== "closed"))) return false;
      var ph = phaseOf(l);
      if (ph.k === "open") return true;
      if (ph.k === "upcoming") return daysFrom(l.apply_start) <= 7;
      return false;
    }).sort(function (a, b) { return (a.apply_end || "9").localeCompare(b.apply_end || "9") || (b.score.total - a.score.total); });
    items.sort(function (a, b) { return ((b.watch ? 2 : 0) + (isBig(b) ? 1 : 0)) - ((a.watch ? 2 : 0) + (isBig(a) ? 1 : 0)) || (a.apply_end || "9").localeCompare(b.apply_end || "9"); });
    var html = '<h2>이번 주 내가 지원할 공고 <small>' + items.length + '건 · 조건 통과(9평↑·월 80만↓) 또는 ⭐ 대형 모집(100호↑, 무조건 지원), 미산정은 노란 메모 · 지금 접수 중이거나 7일 안에 시작 · ⭐ 먼저, 마감 순</small></h2>';
    if (!items.length) html += '<div class="empty">이번 주에 지원할 공고가 없어요. "새로고침(다시 수집)"으로 새 공고를 확인해 보세요.</div>';
    else html += "<ol>" + items.map(function (l, i) {
      var ph = phaseOf(l), mine = mineOf(l), pay = (l.monthly || {}).display_total;
      var period = Schedule.periods(l).map(function(p) { return (p.label || "접수") + " " + Schedule.range(p); }).join(" / ") + " (한국시간)";
      var when = ph.k === "open" ? (ph.urgent ? "<b style='color:var(--rosed)'>" + esc(ph.text.replace("마감 임박 · ", "")) + "</b>" : "<b style='color:var(--blued)'>" + esc(ph.text.replace("접수 중 · ", "")) + "</b>") : "<b style='color:var(--mintd)'>" + esc(ph.sub.split(" · ")[0]) + "</b>";
      return '<li class="' + (ph.urgent ? "urgent" : ph.k) + (mine ? " done" : "") + '"><span class="num">' + (i + 1) + "</span>" +
        '<div class="t"><div class="nm"><button type="button" data-jump="' + esc(l.id) + '">' + esc(starName(l)) + "</button>" + watchBadge(l) + (mine ? ' <span class="pill mine">' + esc(mine.label) + "</span>" : "") + bigBadge(l) + "</div>" +
        '<div class="meta"><span>' + when + " · 접수 " + esc(period) + "</span><span>" + esc(l.gu || "") + (l.station ? " " + esc(l.station) + "역" : "") + (l.transit_min != null ? " · 직장까지 <b>" + l.transit_min + "분</b>" : "") + "</span>" +
        "<span>" + esc(area(l)) + (l.rooms ? " " + esc(l.rooms) : "") + " · 보증금 " + esc(won(l.deposit_won)) + " / 월세 " + esc(won(l.rent_won)) + " → <b>월 " + (pay != null ? man(pay).toLocaleString() + "만" : "?") + "</b></span>" +
        "<span>모집 <b>" + esc(unitsText(l)) + "</b></span>" +
        '<span>' + esc((l.rank ? l.eligibility + " · " + l.rank : l.eligibility) || "자격 미판정") + " · 추천 " + ((l.score || {}).total || 0) + "점" + (isBig(l) && l.status === "rejected" ? " · <b style='color:var(--rosed)'>조건 미달(" + esc(l.status_reasons[0] || "") + ")이지만 대형 모집이라 지원</b>" : "") + (l.status === "unscored" ? " · <b style='color:var(--amberd)'>미산정: " + esc(l.status_reasons.join(", ")) + " — 공고문 확인 후 판단</b>" : "") + "</span></div></div>" +
        '<div class="act"><a class="btn primary" href="' + esc(l.source_url) + '" target="_blank" rel="noopener">바로가기 ↗</a>' + (l.pdf_url ? '<a class="btn" href="' + esc(l.pdf_url) + '" target="_blank" rel="noopener">공고문</a>' : "") +
        '<button class="btn" type="button" data-quick="' + esc(l.id) + '">' + (mine && mine.status === "applied" ? "지원 취소" : "지원함 ✓") + "</button></div></li>";
    }).join("") + "</ol>";
    $("#todo").innerHTML = html;
  }
  function renderSummary(all) {
    var ok = okOrBig;
    var open = all.filter(function (l) { return ok(l) && phaseOf(l).k === "open"; });
    var upc = all.filter(function (l) { return (ok(l) || l.status === "unscored") && phaseOf(l).k === "upcoming"; });
    var mine = all.filter(function (l) { return !!mineOf(l); });
    var waiting = mine.filter(function (l) { var m = state.marks[l.id]; return m.status === "applied" && phaseOf(l).k === "closed"; }).length;
    var soon = open.map(function (l) { return dday(l).d; }).sort(function (a, b) { return a - b; })[0];
    var urgent = open.filter(function (l) { return phaseOf(l).urgent; }).length;
    $("#sum").innerHTML =
      '<div class="s' + (urgent ? " urgent" : "") + '"><div class="l">마감 임박 (5일 미만)</div><div class="v">' + urgent + "건" + (soon != null ? ' <small style="font-size:14px">' + (soon === 0 ? "오늘 마감" : "가장 빠른 D-" + soon) + "</small>" : "") + "</div></div>" +
      '<div class="s hot"><div class="l">접수 중 (지금 신청 가능)</div><div class="v">' + open.length + "건</div></div>" +
      '<div class="s soon"><div class="l">접수 예정</div><div class="v">' + upc.length + "건</div></div>" +
      '<div class="s"><div class="l">내가 지원함 · 결과 대기</div><div class="v">' + mine.length + (waiting ? ' <small style="font-size:14px;color:var(--amberd)">대기 ' + waiting + "</small>" : "") + "</div></div>";
  }
  var URGENT_DAYS = 4;   // 마감까지 4일 이하면 "마감 임박"(빨강), 5일 이상이면 파랑
  var BIG_UNITS = 100, BIG_COMPLEX = 300;
  var SHORT_YEARS = 4;   // 거주 가능 기간이 이보다 짧으면 빨간 딱지   // 대형 모집 딱지 기준 (rules.py 와 동일)
  var PHASE_COLOR = { urgent: "#E5484D", open: "#2F6FED", upcoming: "#17B890", closed: "#9AA39F", unknown: "#9AA39F" };
  // 지도·캘린더가 공유하는 목록: 왼쪽 필터 통과 + 접수 종료·탈락 제외(내가 지원한 건 포함)
  function liveItems(list) {
    return list.filter(function (l) { return mineOf(l) || (l.status !== "closed" && phaseOf(l).k !== "closed" && (l.status !== "rejected" || isBig(l) || l.watch)); });
  }
  function workPoint() {
    var p = state.mode === "static" ? state.profile : null;
    if (p && p.work && p.work.lat != null) return { lat: p.work.lat, lng: p.work.lng, label: (p.work.station || "직장") + "역 (" + (p.name || "나") + " 직장)" };
    return { lat: 37.5665, lng: 126.9780, label: "서울 지도 중심", centerOnly:true };
  }
  function ensureMap() {
    if (state.map || typeof L === "undefined") return state.map;
    var w = workPoint();
    var m = L.map("map", { scrollWheelZoom: true }).setView([w.lat, w.lng], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(m);
    state.workMarker = L.marker([w.lat, w.lng], { icon: L.divIcon({ className: "", html: '<div class="work-icon">★ ' + esc(w.label) + "</div>", iconSize: [0, 0] }), zIndexOffset: 1000 }).addTo(m).bindPopup("<b>" + esc(w.label) + "</b>");
    var legend = L.control({ position: "bottomright" });
    legend.onAdd = function () { var d = L.DomUtil.create("div", "maplegend"); d.innerHTML = '<div><i style="background:#E5484D"></i>마감 임박 (5일 미만)</div><div><i style="background:#2F6FED"></i>접수 중</div><div><i style="background:#17B890"></i>접수 예정</div><div><i style="background:#fff;border:3px solid #7C3AED"></i>내가 지원함</div><div style="color:var(--ink2)">점 크기 = 점수</div>'; return d; };
    legend.addTo(m);
    state.mapLayer = L.layerGroup().addTo(m);
    state.map = m;
    return m;
  }
  function renderMap(list) {
    var on = state.mapOn; $("#map").hidden = !on; $("#mapToggle").textContent = on ? "지도 닫기" : "지도 보기"; $("#mapToggle").setAttribute("aria-pressed", on);
    if (!on) { $("#mapNote").hidden = true; return; }
    var m = ensureMap(); if (!m) { $("#mapNote").hidden = false; $("#mapNote").textContent = "지도 라이브러리를 불러오지 못했어요(인터넷 연결 확인)."; return; }
    state.mapLayer.clearLayers();
    var wp = workPoint();
    if (state.workMarker) { state.workMarker.setOpacity(wp.centerOnly ? 0 : 1); state.workMarker.setLatLng([wp.lat, wp.lng]); state.workMarker.setIcon(L.divIcon({ className: "", html: '<div class="work-icon">★ ' + esc(wp.label) + "</div>", iconSize: [0, 0] })); state.workMarker.bindPopup("<b>" + esc(wp.label) + "</b>"); }
    var missing = 0, bounds = [[wp.lat, wp.lng]];
    var items = liveItems(list), hidden = list.length - items.length;
    items.forEach(function (l) {
      var mine = mineOf(l);
      var ph = phaseOf(l), sc = (l.score || {}).total || 0;
      if ((l.lat == null || l.lng == null) && l.sites && l.sites.length) {
        // 다지점 공고: 집 단위 작은 점
        var scolor = l.status === "rejected" ? "#9AA39F" : (ph.urgent ? PHASE_COLOR.urgent : PHASE_COLOR[ph.k]) || "#9AA39F";
        l.sites.forEach(function (site) {
          if (site.lat == null || site.lng == null) return;
          var sm = L.circleMarker([site.lat, site.lng], { radius: 6, color: scolor, weight: 2, fillColor: "#fff", fillOpacity: .95 });
          var p = state.profile;
          var costs = p ? Engine.monthlyCost(Object.assign({}, l, site, { rent_won:site.rent_won == null ? l.rent_won : site.rent_won }), p) : null;
          var payText = costs && costs.display_total != null ? "<br>입력한 은행 금리의 월 비용 예시 " + esc(won(costs.display_total)) + " · 대출 승인/한도 미확인 · 이자지원 자동 할인 없음" : "<br>내 조건·보증금·월세·금리 확인 후 비용 예시 계산";
          sm.bindPopup('<span class="pill ' + ph.k + '">' + esc(ph.text) + "</span><br><b>" + esc(starName(l)) + "</b><br>" + esc(site.name || "") + "<br>" + esc(site.address || "") + "<br>" +
            (site.area_m2 ? "전용 " + site.area_m2 + "㎡(" + py(site.area_m2) + "평)" : "") + (site.rooms ? " 방" + site.rooms : "") + (site.deposit_won != null ? " · 전세 " + won(site.deposit_won) : "") +
            payText +
            '<div class="row" style="margin-top:6px"><a class="btn primary" href="' + esc(l.source_url) + '" target="_blank" rel="noopener">신청 페이지 ↗</a> <button class="btn" type="button" data-jump="' + esc(l.id) + '">카드로 이동</button></div>', { maxWidth: 360 });
          sm.bindTooltip((isBig(l) ? "⭐ " : "") + (site.name || site.address || "").slice(0, 16), { direction: "right", offset: [8, 0], className: "mk-label " + (ph.urgent ? "urgent" : ph.k) });
          sm.addTo(state.mapLayer); bounds.push([site.lat, site.lng]);
        });
        return;
      }
      if (l.lat == null || l.lng == null) { missing++; return; }
      var color = l.status === "rejected" ? "#9AA39F" : (ph.urgent ? PHASE_COLOR.urgent : PHASE_COLOR[ph.k]) || "#9AA39F";
      var r = (isBig(l) ? 10 : 6) + Math.min(10, sc / 8);
      var mk = L.circleMarker([l.lat, l.lng], { radius: r, color: mine ? "#7C3AED" : "#fff", weight: mine ? 3 : 1.5, fillColor: color, fillOpacity: l.status === "closed" || l.status === "rejected" ? .55 : .9 });
      var pay = (l.monthly || {}).display_total;
      mk.bindPopup('<span class="pill ' + ph.k + '">' + esc(ph.text) + "</span>" + (mine ? ' <span class="pill mine">' + esc(mine.label) + "</span>" : "") + "<br><b>" + esc(starName(l)) + "</b> " + bigBadge(l) + "<br>" +
        esc([l.gu, l.station ? l.station + "역" : "", l.transit_min != null ? "직장까지 " + l.transit_min + "분" : "교통 미산정"].filter(Boolean).join(" · ")) + "<br>" +
        esc(area(l)) + " · " + (pay != null ? "월 " + man(pay).toLocaleString() + "만" : "월납입 미산정") + " · " + esc(unitsText(l)) + " · 점수 " + sc + (l.status === "rejected" ? "<br><span style='color:var(--rosed)'>" + esc(l.status_reasons[0] || "탈락") + "</span>" : "") +
        '<div class="row" style="margin-top:6px"><a class="btn primary" href="' + esc(l.source_url) + '" target="_blank" rel="noopener">신청 페이지 바로가기 ↗</a>' + (l.pdf_url ? ' <a class="btn" href="' + esc(l.pdf_url) + '" target="_blank" rel="noopener">공고문 PDF</a>' : "") + ' <button class="btn" type="button" data-jump="' + esc(l.id) + '">카드로 이동</button></div>', { maxWidth: 360 });
      var short = l.name.replace(/\[.*?\]\s*/g, "").replace(/(최초|추가)?모집\s*공고(문)?/g, "").trim().slice(0, 18);
      var live = l.status !== "closed" && (l.status !== "rejected" || isBig(l));
      if ((live && (ph.k === "open" || ph.k === "upcoming")) || mine) mk.bindTooltip(short, { permanent: true, direction: "right", offset: [r + 2, 0], className: "mk-label " + (ph.urgent ? "urgent" : ph.k) });
      else mk.bindTooltip(short, { direction: "right", offset: [r + 2, 0], className: "mk-label" });
      mk.addTo(state.mapLayer); bounds.push([l.lat, l.lng]);
    });
    setTimeout(function () { m.invalidateSize(); if (bounds.length > 1) m.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 }); }, 50);
    $("#mapNote").hidden = false; $("#mapNote").textContent = "지도에 " + (items.length - missing) + "건" + (missing ? " · 주소를 몰라 못 찍은 공고 " + missing + "건" : "") + (hidden ? " · 접수 종료·탈락 " + hidden + "건은 지도에서 숨김" : "") + " — 왼쪽 필터가 그대로 적용됩니다.";
  }
  function renderCal(list) {
    var d = state.data, t0 = new Date(todayISO());
    var items = liveItems(list || d.listings);
    var expanded = localStorage.getItem("cheongyak:cal") === "month";
    var weeks = expanded ? 5 : 2;
    var sunday = new Date(t0.getTime() - t0.getUTCDay() * 864e5);          // 이번 주 일요일
    var days = [];
    for (var i = 0; i < weeks * 7; i++) days.push(new Date(sunday.getTime() + i * 864e5).toISOString().slice(0, 10));
    var today = todayISO();
    var ev = {};
    var push = function (day, e) { if (days.indexOf(day) >= 0) (ev[day] = ev[day] || []).push(e); };
    items.forEach(function (l) {
      var short = starName(l).replace(/\[.*?\]\s*/g, "").slice(0, 16);
      Schedule.events(l).forEach(function(e) {
        if (e.kind === "ann" && !mineOf(l)) return;
        push(e.date, { c: e.kind, t: short + " · " + e.label + " " + (e.time || "시각 미확인") + (e.after ? " 이후" : ""), id:l.id });
      });
      var m = mineOf(l); if (m && l.apply_end) push(l.apply_end, { c: "mine", t: "내 지원: " + short.slice(0, 14), id: l.id });
    });
    $("#calTitle").textContent = (expanded ? "접수 일정 · 한 달 (이번 주부터 5주)" : "접수 일정 · 이번 주 + 다음 주") + " · " + items.length + "건 (지도와 같은 목록: 왼쪽 필터 통과, 탈락·종료 제외)";
    $("#calToggle").textContent = expanded ? "2주만 보기 ▴" : "한 달 보기 ▾";
    $("#cal").innerHTML = days.map(function (day) {
      var dt = new Date(day), dow = dt.getUTCDay(), isToday = day === today;
      var cls = "d" + (isToday ? " today" : "") + (day < today ? " past" : "") + (dow === 0 ? " sun" : dow === 6 ? " sat" : "");
      var mo = (dt.getUTCDate() === 1 || day === days[0]) ? '<span class="mo">' + (dt.getUTCMonth() + 1) + "월</span>" : "";
      var list = ev[day] || [];
      return '<div class="' + cls + '"><div class="n">' + mo + dt.getUTCDate() + (isToday ? "<small>오늘</small>" : "") + "</div>" +
        list.slice(0, 4).map(function (e) { return '<div class="e ' + e.c + '" tabindex="0" data-jump="' + esc(e.id) + '" title="' + esc(e.t) + '">' + esc(e.t) + "</div>"; }).join("") +
        (list.length > 4 ? '<div class="e">+' + (list.length - 4) + "</div>" : "") + "</div>";
    }).join("");
  }
  function initFilters() {
    var d = state.data, types = {}, gus = {};
    d.listings.forEach(function (l) { types[l.type] = (types[l.type] || 0) + 1; if (l.gu) gus[l.gu] = (gus[l.gu] || 0) + 1; });
    $("#types").innerHTML = Object.keys(types).sort().map(function (t) {
      return '<label><input type="checkbox" value="' + esc(t) + '" checked> ' + esc(t) + '<span class="n">' + types[t] + "</span></label>";
    }).join("");
    $("#gu").innerHTML += Object.keys(gus).sort().map(function (g) { return '<option value="' + esc(g) + '">' + esc(g) + " (" + gus[g] + ")</option>"; }).join("");
    var p = d.profile_summary;
    $("#meta").textContent = "공고 정보 · 한국시간(KST)";
    $("#freshness").textContent = freshness(d);
    var anyEst = d.listings.some(function (l) { return l.transit_mode === "estimate"; });
    $("#transitNote").textContent = anyEst ? "교통시간은 가까운 지하철역 기준 추정치입니다. config.local.json에 ODsay 키를 넣으면 실제 지하철+버스 경로로 바뀝니다." : "교통시간은 ODsay 실제 경로 기준입니다.";
    $("#fail").innerHTML = d.failures && d.failures.length ? '<div class="fail">수집 실패: ' + esc(d.failures.join(" / ")) + "</div>" : "";
  }
  function bind() {
    document.addEventListener("change", function (e) {
      if (e.target.matches("[data-called]")) { var cid = e.target.getAttribute("data-called"); var me = $('[data-callmemo="' + cid + '"]'); return saveCall(cid, e.target.checked, me ? me.value : ""); }
      if (e.target.matches("[data-callmemo]")) { var cid2 = e.target.getAttribute("data-callmemo"); var cb = $('[data-called="' + cid2 + '"]'); return saveCall(cid2, cb ? cb.checked : false, e.target.value); }
      if (e.target.matches("[data-mark]")) { var id = e.target.getAttribute("data-mark"); var memoEl = $('[data-memo="' + id + '"]'); return saveMark(id, e.target.value, memoEl ? memoEl.value : ""); }
      if (e.target.matches("[data-memo]")) { var mid = e.target.getAttribute("data-memo"); var sel = $('[data-mark="' + mid + '"]'); if (sel && sel.value) return saveMark(mid, sel.value, e.target.value); return; }
      if (e.target.closest(".side")) render();
    });
    document.addEventListener("input", function (e) { if (e.target.matches("#minPy,#maxPay,#q")) render(); });
    $("#refresh").addEventListener("click", function () { if (state.mode === "static") refreshPosted(); else startRun("full"); });
    $("#calToggle").addEventListener("click", function () { localStorage.setItem("cheongyak:cal", localStorage.getItem("cheongyak:cal") === "month" ? "2w" : "month"); render(); });
    $("#mapToggle").addEventListener("click", function () { state.mapOn = !state.mapOn; localStorage.setItem("cheongyak:map", state.mapOn ? "1" : "0"); render(); });
    $("#rebuild").addEventListener("click", function () { startRun("rebuild"); });
    document.addEventListener("click", function (e) {
      var fav = e.target.closest("[data-fav]");
      if (fav) { var id = fav.getAttribute("data-fav"); var i = state.fav.indexOf(id); if (i >= 0) state.fav.splice(i, 1); else state.fav.push(id); saveFav(); render(); return; }
      var qk = e.target.closest("[data-quick]");
      if (qk) { var qid = qk.getAttribute("data-quick"); var cur = state.marks[qid]; return saveMark(qid, cur && cur.status === "applied" ? "" : "applied", cur ? cur.memo : ""); }
      var tg = e.target.closest("[data-toggle]");
      if (tg) { var tid = tg.getAttribute("data-toggle"); state.open[tid] = !state.open[tid]; render(); return; }
      var jump = e.target.closest("[data-jump]");
      if (jump) { var jid = jump.getAttribute("data-jump"); $("input[name=view][value=all]").checked = true; $("#showClosed").checked = true; state.open[jid] = true; render(); var el = $('[data-id="' + jid + '"]'); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
      if (e.target.id === "copyFav") {
        var lines = state.data.listings.filter(function (l) { return isFav(l.id); }).map(function (l) { return l.id + " | " + l.name + " | " + Schedule.periods(l).map(function(p) { return (p.label || "접수") + " " + Schedule.range(p); }).join(" / ") + " (한국시간)" + " | " + (l.pdf_url || l.source_url); });
        var txt = lines.join("\n") || "(찜 없음)";
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { e.target.textContent = "복사됨 ✓"; setTimeout(function () { e.target.textContent = "찜 목록 복사"; }, 1500); });
        else window.prompt("복사하세요", txt);
      }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.matches("[data-jump]")) e.target.click(); });
  }
  function saveMark(id, status, memo) {
    if (state.mode === "static") { if (status) state.marks[id] = { status: status, memo: memo || "" }; else delete state.marks[id]; localStorage.setItem("cheongyak:marks", JSON.stringify(state.marks)); render(); return; }
    fetch("/api/mark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id, status: status, memo: memo }) })
      .then(function (r) { return r.json(); }).then(function (j) { if (j.ok) { state.marks = j.marks; render(); } })
      .catch(function () { setRunStatus("상태 저장 실패 — 서버가 꺼져 있어요(scripts/serve.sh start).", true); });
  }
  function setRunStatus(msg, show) { var el = $("#runStatus"); el.hidden = !show; el.textContent = msg || ""; }
  function setBusy(b) { $("#refresh").disabled = b; $("#rebuild").disabled = b; }
  function refreshPosted() {
    setBusy(true); setRunStatus("게시된 데이터 조회 중… 실제 수집은 실행하지 않습니다.", true);
    fetch("facts.json?_=" + Date.now(), { cache:"no-store" }).then(function(r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function(f) {
      if (!Array.isArray(f.listings)) throw new Error("invalid data");
      state.facts = f; evaluateAll(); initFilters(); render();
      setRunStatus("게시된 데이터 재조회 완료 · 실제 재수집은 요청되지 않았습니다.", true);
    }).catch(function() { setRunStatus("게시된 데이터 조회 실패 · 기존 화면을 유지합니다. 실제 수집 상태는 확인할 수 없습니다.", true); }).finally(function() { setBusy(false); });
  }
  function kstTime(value) {
    if (!value || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return "미확인";
    var date = new Date(value); if (isNaN(date.getTime())) return "미확인";
    return new Intl.DateTimeFormat("ko-KR", {timeZone:"Asia/Seoul",dateStyle:"short",timeStyle:"medium",hour12:false}).format(date) + " KST";
  }
  function freshness(d) {
    var c = d.collection || {}, labels = {unknown:"미확인",running:"수집 중(게시 시점 기준)",completed:"수집 종료",partial:"일부 실패 · 이전 자료 포함 가능",failed:"수집 실패"};
    return "실제 수집 시작: " + kstTime(c.started_at) + " / 종료: " + kstTime(c.finished_at) +
      " · 마지막 전체 수집 성공: " + kstTime(c.last_success_at) + " · 게시 시점 수집 상태: " + (labels[c.status] || "미확인") + " · 데이터 생성: " + kstTime(d.generated) +
      (d.built_at ? " · 공개본 생성: " + kstTime(d.built_at) : "") +
      (d.static ? " · 이 버튼은 게시 자료만 다시 읽습니다. 수집은 운영자의 Mac 일일 작업에 의존하며 실시간 연결되어 있지 않습니다." : "");
  }
  function startRun(mode) {
    setBusy(true); setRunStatus(mode === "full" ? "공고 다시 수집 중… (3~5분)" : "다시 계산 중…", true);
    fetch("/api/run?mode=" + mode, { method: "POST" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.started) { setRunStatus("이미 실행 중이에요. 잠시 기다려 주세요.", true); }
      pollRun();
    }).catch(function () { setBusy(false); setRunStatus("서버에 연결하지 못했어요. scripts/serve.sh start 로 띄웠는지 확인하세요.", true); });
  }
  function pollRun() {
    fetch("/api/status").then(function (r) { return r.json(); }).then(function (s) {
      if (s.running) { setTimeout(pollRun, 3000); return; }
      setBusy(false);
      if (s.exit_code === 0) { setRunStatus("완료 — 화면을 갱신했어요.", true); loadData(); setTimeout(function () { setRunStatus("", false); }, 4000); }
      else setRunStatus("실패(코드 " + s.exit_code + "). 로그: " + (s.log || "").slice(-300), true);
    }).catch(function () { setBusy(false); });
  }
  // ---------- 내 조건(프로필) ----------
  var PKEY = "cheongyak:profile", PLIST = "cheongyak:profiles", PACTIVE = "cheongyak:profile_active";
  function loadProfile() { try { return JSON.parse(localStorage.getItem(PKEY) || "null"); } catch (e) { return null; } }
  function saveProfile(p) { if (p) localStorage.setItem(PKEY, JSON.stringify(p)); else localStorage.removeItem(PKEY); }
  function loadProfiles() { try { return JSON.parse(localStorage.getItem(PLIST) || "{}"); } catch (e) { return {}; } }
  function saveProfiles(m) { localStorage.setItem(PLIST, JSON.stringify(m)); }
  function renderPick() {
    var sel = $("#profPick"); if (!sel) return;
    var m = loadProfiles(), active = localStorage.getItem(PACTIVE) || "__new__";
    var opts = [];
    Object.keys(m).sort().forEach(function (n) { opts.push([n, n]); });
    opts.push(["__new__", "+ 새 조건 입력"]);
    sel.innerHTML = opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === active ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("");
  }
  function applyProfile(key) {
    var m = loadProfiles();
    state.profile = m[key] || null; state.profileIsDefault = false;
    if (!state.profile) { fillForm({ regions: [] }); $("#prof").open = true; }
    localStorage.setItem(PACTIVE, key); saveProfile(state.profile && !state.profileIsDefault ? state.profile : null);
    if (state.profile) fillForm(state.profile);
    evaluateAll(); initFilters(); render(); renderPick();
  }
  function splitList(s) { return (s || "").split(/[,，\s]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function readForm() {
    var name = $("#p_work").value.trim(), st = null;
    if (name) { var cands = state.stations.filter(function (s) { return s.name === name; }); if (cands.length) st = { station: name, lat: cands[0].lat, lng: cands[0].lng, lines: cands.map(function (s) { return s.line; }) }; }
    var regions = [];
    splitList($("#p_r1").value).forEach(function (n) { regions.push({ name: n, points: 10 }); });
    splitList($("#p_r2").value).forEach(function (n) { regions.push({ name: n, points: 8 }); });
    splitList($("#p_r3").value).forEach(function (n) { regions.push({ name: n, points: 7 }); });
    splitList($("#p_other").value).forEach(function (n) { regions.push({ name: n, points: 3 }); });
    var man = function (id) { var v = parseFloat($(id).value); return isNaN(v) ? null : Math.round(v * 10000); };
    return { name: $("#p_name").value.trim() || "나", birth_year: parseInt($("#p_birth").value, 10) || null, marital: $("#p_marital").value, household_size: 1,
      income_annual_won: man("#p_income"), savings_won: man("#p_savings"), own_cash_won: man("#p_cash"), car: $("#p_car").checked,
      residence_sido: $("#p_sido").value, work: st, work_name: name, regions: regions,
      min_pyeong: parseFloat($("#p_minpy").value) || 9, max_monthly_won: man("#p_maxpay") || 500000, border_monthly_won: (man("#p_maxpay") || 500000) + 50000, min_private_years: parseInt($("#p_years").value, 10) || 4,
      rates: { youth_loan: null, bank_loan: $("#p_rate").value === "" ? null : parseFloat($("#p_rate").value) / 100 }, seoul_support: $("#p_support").checked, subscription_joined: null };
  }
  function fillForm(p) {
    if (!p) return;
    $("#p_rate").value = p.rates && p.rates.bank_loan != null ? p.rates.bank_loan * 100 : "";
    $("#p_name").value = p.name || ""; $("#p_birth").value = p.birth_year || ""; $("#p_marital").value = p.marital || "single";
    $("#p_income").value = p.income_annual_won != null ? Math.round(p.income_annual_won / 10000) : ""; $("#p_savings").value = p.savings_won != null ? Math.round(p.savings_won / 10000) : "";
    $("#p_cash").value = p.own_cash_won != null ? Math.round(p.own_cash_won / 10000) : ""; $("#p_car").checked = !!p.car; $("#p_sido").value = p.residence_sido || "서울";
    $("#p_work").value = (p.work && p.work.station) || p.work_name || "";
    var by = function (pts) { return (p.regions || []).filter(function (r) { return r.points === pts; }).map(function (r) { return r.name; }).join(", "); };
    $("#p_r1").value = by(10); $("#p_r2").value = by(8); $("#p_r3").value = by(7); $("#p_other").value = by(3);
    $("#p_minpy").value = p.min_pyeong || 9; $("#p_maxpay").value = Math.round((p.max_monthly_won || 500000) / 10000); $("#p_years").value = p.min_private_years || 4; $("#p_support").checked = !!p.seoul_support;
  }
  function validateProfile(p) {
    var miss = [];
    if (!p.work) miss.push("직장 지하철역(목록에서 선택)"); if (!p.regions.length) miss.push("지역(1순위 또는 그 외 허용 지역)");
    if (p.rates.bank_loan != null && (!isFinite(p.rates.bank_loan) || p.rates.bank_loan < 0 || p.rates.bank_loan > 1)) miss.push("은행 연금리(0~100%)");
    return miss;
  }
  function evaluateAll() {
    var f = state.facts, p = state.profile, today = todayISO();
    var ls = f.listings.map(function (l) {
      var c = Object.assign({}, l);
      if (p) { var r = Engine.evaluate(c, p, state.stations, today); Object.assign(c, r); c.rank = null; }
      else { c.status = "neutral"; c.status_reasons = []; c.score = { total: 0 }; c.monthly = { display_total: null, verdict: "unknown" }; c.transit_min = null; c.eligibility = null; c.region_points = 0; }
      return c;
    });
    state.data = { generated: f.generated, today: f.today, failures: f.failures || [], static: true, collection: f.collection, built_at: f.built_at, listings: ls,
      profile_summary: { name: p ? p.name : "", work: p && p.work ? p.work.station : "", max_monthly_won: p ? p.max_monthly_won : null } };
    $("#profWho").textContent = p ? ((state.profileIsDefault ? p.name + " (기본값) · " : p.name + " · ") + (p.work ? p.work.station : "") + " · " + (p.regions || []).slice(0, 3).map(function (r) { return r.name; }).join("·")) : "저장된 개인 조건 없음";
    $("#neutralNote").innerHTML = p ? "" : '<div class="neutral-note">왼쪽 <b>내 조건</b>을 입력하면 직장까지 시간·월 납입액·자격·추천 점수가 내 기준으로 계산되고, 내 지역 공고만 보입니다. 지금은 모든 공고를 마감 순으로 보여줍니다.</div>';
  }
  function bindProfile() {
    var dl = $("#stationList"); var names = {}; state.stations.forEach(function (s) { names[s.name] = 1; });
    dl.innerHTML = Object.keys(names).sort().map(function (n) { return '<option value="' + esc(n) + '">'; }).join("");
    $("#profSave").addEventListener("click", function () {
      var p = readForm(), miss = validateProfile(p);
      if (miss.length) { alert("입력이 더 필요해요: " + miss.join(", ")); return; }
      var m = loadProfiles(); m[p.name] = p; saveProfiles(m);
      localStorage.setItem(PACTIVE, p.name);
      state.profile = p; state.profileIsDefault = false; saveProfile(p); evaluateAll(); initFilters(); render(); renderPick(); $("#prof").open = false;
    });
    $("#profPick").addEventListener("change", function (e) { applyProfile(e.target.value); });
    $("#profDelete").addEventListener("click", function () {
      var key = $("#profPick").value;
      if (key === "__default__" || key === "__new__") { alert("기본값은 지울 수 없어요."); return; }
      if (!confirm("'" + key + "' 조건을 지울까요?")) return;
      var m = loadProfiles(); delete m[key]; saveProfiles(m); applyProfile("__default__");
    });
    $("#profReset").addEventListener("click", function () { fillForm({ regions: [] }); $("#p_name").focus(); });
    $("#profExport").addEventListener("click", function () { var p = state.profile || readForm(); var code = btoa(unescape(encodeURIComponent(JSON.stringify(p)))); if (navigator.clipboard) navigator.clipboard.writeText(code).then(function () { alert("복사했어요. 다른 기기의 '코드 붙여넣기'에 넣으세요."); }); else prompt("복사하세요", code); });
    $("#profImport").addEventListener("click", function () { var code = prompt("내 조건 코드를 붙여넣으세요"); if (!code) return; try { var p = JSON.parse(decodeURIComponent(escape(atob(code.trim())))); var m = loadProfiles(); m[p.name || "가져온 조건"] = p; saveProfiles(m); localStorage.setItem(PACTIVE, p.name || "가져온 조건"); state.profile = p; state.profileIsDefault = false; saveProfile(p); fillForm(p); evaluateAll(); initFilters(); render(); renderPick(); } catch (e) { alert("코드가 올바르지 않아요."); } });
  }
  function bootStatic() {
    state.mode = "static"; document.body.classList.add("static");
    fetch("seasonality.json?_=" + Date.now()).then(function (r) { return r.json(); }).then(renderSeason).catch(function () { var el = $("#season"); if (el) el.hidden = true; });
    try { state.marks = JSON.parse(localStorage.getItem("cheongyak:marks") || "{}"); } catch (e) { state.marks = {}; }
    Promise.all([fetch("facts.json?_=" + Date.now()).then(function (r) { return r.json(); }), fetch("stations.json?_=" + Date.now()).then(function (r) { return r.json(); }).catch(function () { return []; })])
      .then(function (res) {
        state.facts = res[0]; state.stations = res[1] || [];
        state.complexes = null; state.calls = loadCallsLocal(); renderPhoneList(); renderNews(state.facts.news);
        state.facts.listings.forEach(function (l) { l.status_reasons = []; l.score = { total: 0 }; });
        (function () {
          var m = loadProfiles(), active = localStorage.getItem(PACTIVE), legacy = loadProfile();
          if (legacy && legacy.name && !m[legacy.name] && !active) { m[legacy.name] = legacy; saveProfiles(m); active = legacy.name; localStorage.setItem(PACTIVE, active); }
          if (active && m[active]) { state.profile = m[active]; state.profileIsDefault = false; }
          else { state.profile = active === "__new__" ? null : legacy; state.profileIsDefault = false; }

          fillForm(state.profile);
        })();
        bindProfile(); renderPick(); evaluateAll(); $("#gu").innerHTML = '<option value="">전체</option>'; $("#types").innerHTML = "";
        initFilters(); renderCal(); if (!bound) { bind(); bound = true; } render();
        if (!state.profile) $("#prof").open = true;
        $("#refresh").textContent = "게시된 데이터 다시 불러오기";
        $("#refresh").title = "이미 게시된 JSON을 다시 읽습니다. 실제 수집을 시작하지 않습니다.";

      }).catch(function (err) { $("#meta").textContent = "facts.json을 읽지 못했어요: " + err; });
  }
  function bootOwner() {
    state.mode = "owner"; document.body.classList.add("owner");
    Promise.all([fetch("/api/complexes").then(function (r) { return r.json(); }).catch(function () { return null; }), fetch("/api/calls").then(function (r) { return r.json(); }).catch(function () { return {}; })])
      .then(function (res) { state.complexes = res[0]; state.calls = res[1] || {}; renderPhoneList(); });
    loadData();
  }
  var bound = false;
  function loadData() {
    fetch("seasonality.json?_=" + Date.now()).then(function (r) { return r.json(); }).then(renderSeason).catch(function () { var el = $("#season"); if (el) el.innerHTML = "<h4>월별 공고 흐름</h4><div class='sub'>seasonality.json 없음 — scripts/seasonality.py 실행</div>"; });
    fetch("/api/marks").then(function (r) { return r.json(); }).then(function (m) { if (!document.body.classList.contains("static")) { state.marks = m || {}; render(); } }).catch(function () {});
    return fetch("data.json?_=" + Date.now()).then(function (r) { return r.json(); }).then(function (d) {
      d.listings.forEach(function (l) { l.score = l.score || { total: 0 }; l.status_reasons = l.status_reasons || []; });
      renderNews(d.news);
      state.data = d; $("#types").innerHTML = ""; $("#gu").innerHTML = '<option value="">전체</option>';
      if (d.static) { document.body.classList.add("static"); }
      initFilters(); renderCal(); if (!bound) { bind(); bound = true; } render();
    }).catch(function (err) { $("#meta").textContent = "data.json을 읽지 못했어요: " + err; });
  }
  // 정적 공유본(/api 없음)이면 engine 모드, 맥(서버)이면 소유자 모드
  fetch("/api/status", { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("no api"); return r.json(); }).then(bootOwner).catch(bootStatic);
  var clockState = "";
  setInterval(function () {
    if (!state.data) return;
    var next = todayISO() + state.data.listings.map(function(l) { var p = phaseOf(l); return l.id + p.k + p.sub + p.urgent; }).join("|");
    if (next === clockState) return;
    clockState = next;
    if (state.mode === "static") evaluateAll();
    render();
  }, 30000);
})();

/* engine.js — 브라우저에서 각자 조건(profile)으로 공고(facts)를 계산한다.
   Python(cheongyak/rules.py·cost.py·score.py·eligibility.py)과 같은 규칙. 바꾸면 양쪽 다 + tests/test_engine.py 로 교차 확인. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var R = {
    M2_PER_PYEONG: 3.3058,
    TRANSIT_POINTS: [[20, 40], [30, 32], [40, 24], [50, 14], [60, 6]],
    AREA_POINTS: [[9, 5], [11, 10], [13, 15], [15, 20]],
    YEARS_POINTS: [[4, 5], [6, 10]],
    UNITS_POINTS: [[10, 4], [30, 8], [100, 12], [300, 15]],
    LINE_BONUS: 5, LINE_WALK_MAX: 10, ROOM_BONUS: 5, BIG_COMPLEX_BONUS: 2, BIG_COMPLEX_UNITS: 300, BIG_RECRUIT_UNITS: 100,
    SUBWAY_KMH: 32, DETOUR: 1.25, TRANSFER_MIN: 8, WAIT_MIN: 4, WORK_WALK_MIN: 3
  };
  var INCOME_1P_120 = 4576036, ASSET_YOUTH = 251000000, ASSET_NATIONAL = 345000000, ASSET_JANGI = 662000000;
  var RULES = {
    "행복주택": { age: [19, 39], single: true, income: INCOME_1P_120, asset: ASSET_YOUTH, account: false, rank1: true, note: "거주·직장 지역이면 1순위, 공고별 해당 구 우선공급" },
    "청년안심-공공": { age: [19, 39], single: true, income: INCOME_1P_120, asset: ASSET_YOUTH, account: false, note: "3순위(본인 소득·자산), 시세 50%" },
    "청년안심-민간": { age: [19, 39], single: false, income: null, asset: null, account: false, note: "일반공급은 소득·자산 무관(자동차 4,542만 이하). 의무기간 종료 연도 확인" },
    "매입임대": { age: [19, 39], single: true, income: INCOME_1P_120, asset: ASSET_YOUTH, account: false, note: "청년 3순위, 보증금 200만·시세 50%" },
    "공공지원민간": { age: [19, 39], single: false, income: null, asset: null, account: false, note: "일반공급 소득·자산 무관. 의무기간 10년" },
    "장기전세": { age: [19, 200], single: false, income: INCOME_1P_120, asset: ASSET_JANGI, account: true, note: "1인 세대주는 전용 40㎡ 이하만. 1순위 = 통장 2년·24회" },
    "국민임대": { age: [19, 200], single: false, income: INCOME_1P_120, asset: ASSET_NATIONAL, account: true, note: "1인가구 40㎡ 이하 우선. 공고문 확인" },
    "전세임대": { age: [19, 39], single: true, income: INCOME_1P_120, asset: ASSET_YOUTH, account: false, note: "청년 전세임대 3순위 기준 가정" }
  };

  function bround(x) { var f = Math.floor(x), d = x - f; if (d > 0.5) return f + 1; if (d < 0.5) return f; return f % 2 === 0 ? f : f + 1; }
  function toPyeong(m2) { return bround(m2 / R.M2_PER_PYEONG * 10) / 10; }
  function haversine(lat1, lng1, lat2, lng2) {
    var r = 6371, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180, dp = (lat2 - lat1) * Math.PI / 180, dl = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * r * Math.asin(Math.sqrt(a));
  }
  function nearestStation(lat, lng, stations) {
    if (!stations || !stations.length) return null;
    var best = null, bd = 1e9;
    stations.forEach(function (s) { var d = haversine(lat, lng, s.lat, s.lng); if (d < bd) { bd = d; best = s; } });
    var lines = {}; stations.forEach(function (s) { if (s.name === best.name && haversine(best.lat, best.lng, s.lat, s.lng) < 0.3) lines[s.line] = 1; });
    var ls = Object.keys(lines).sort(function (a, b) { return a.length - b.length || (a < b ? -1 : 1); });
    return { name: best.name, lines: ls, lat: best.lat, lng: best.lng, dist_km: bd, walk_min: Math.ceil(bd * 1000 / 80) };
  }
  function intersects(a, b) { return (a || []).some(function (x) { return (b || []).indexOf(x) >= 0; }); }

  // ---- 교통: 공고의 가까운 역 → 직장 역 (추정) ----
  function transitEstimate(l, profile, stations) {
    var w = profile && profile.work;
    if (!w || w.lat == null || w.lng == null) return null;
    var st = (l.station_lat != null) ? { lat: l.station_lat, lng: l.station_lng, lines: l.station_lines || [], walk_min: l.station_walk_min || 0, name: l.station } :
      (l.lat != null ? nearestStation(l.lat, l.lng, stations) : null);
    if (!st) return null;
    var work = nearestStation(w.lat, w.lng, stations) || { lat: w.lat, lng: w.lng, lines: w.lines || [] };
    var workLines = (w.lines && w.lines.length) ? w.lines : (work.lines || []);
    var km = haversine(st.lat, st.lng, work.lat, work.lng);
    var subway = Math.ceil(km / R.SUBWAY_KMH * 60 * R.DETOUR);
    var transfer = intersects(st.lines, workLines) ? 0 : R.TRANSFER_MIN;
    var total = st.walk_min + R.WAIT_MIN + subway + transfer + R.WORK_WALK_MIN;
    return { minutes: total, mode: "estimate", station: st.name, lines: st.lines, walk_min: st.walk_min,
      detail: "도보 " + st.walk_min + "분 + 대기 " + R.WAIT_MIN + "분 + 지하철 " + subway + "분 + 환승 " + transfer + "분 + 도보 " + R.WORK_WALK_MIN + "분 (추정, " + (w.station || "직장") + " 기준)" };
  }

  // ---- 월 납입 ----
  function interest(loan, rate) { return rate == null ? null : bround(loan * rate / 12); }
  function baseCost(dep, rent, own, rates) {
    var out = { loan_won: 0, interest_youth: null, interest_bank: null, total_youth: null, total_bank: null, display_total: null, verdict: "unknown", alt: null };
    if (dep == null || rent == null) return out;
    var loan = Math.max(0, dep - own); out.loan_won = loan;
    var iy;
    if (rates.support_rate != null && rates.support_cap_won) {
      var cap = rates.support_cap_won;
      iy = interest(Math.min(loan, cap), rates.support_rate) + (loan > cap ? (interest(loan - cap, rates.youth_loan) || 0) : 0);
    } else iy = interest(loan, rates.youth_loan);
    var ib = interest(loan, rates.bank_loan);
    out.interest_youth = iy; out.interest_bank = ib;
    out.total_youth = iy != null ? rent + iy : null; out.total_bank = ib != null ? rent + ib : null;
    if (out.total_youth != null) out.display_total = out.total_youth;
    else if (out.total_bank != null) out.display_total = out.total_bank;
    else { out.display_total = rent; if (loan > 0) return out; }
    var t = out.display_total, max = rates._max || 500000, border = rates._border || 550000;
    out.verdict = t <= max ? "ok" : t <= border ? "border" : "over";
    return out;
  }
  function parseConvertPct(note) {
    if (!note || note.indexOf("불가") >= 0) return null;
    var p = (note.match(/(\d+(?:\.\d+)?)\s*%/g) || []).map(function (s) { return parseFloat(s); });
    if (!p.length) return null;
    if (p.length === 1) return [p[0], p[0]];
    var a = p[0], b = p[1];
    var m1 = note.match(/보증금\s*→\s*월세[^%]*?(\d+(?:\.\d+)?)\s*%/), m2 = note.match(/월세\s*→\s*보증금[^%]*?(\d+(?:\.\d+)?)\s*%/);
    if (m1 && m2) { a = parseFloat(m1[1]); b = parseFloat(m2[1]); }
    return [a, b];
  }
  function monthlyCost(l, profile) {
    var rates = Object.assign({}, profile.rates || {}, { _max: profile.max_monthly_won, _border: profile.border_monthly_won });
    if (!profile.seoul_support) { rates.support_rate = null; rates.support_cap_won = null; }
    var out = baseCost(l.deposit_won, l.rent_won, profile.own_cash_won, rates);
    var cp = parseConvertPct(l.convert_note);
    var rate = rates.youth_loan != null ? rates.youth_loan : rates.bank_loan;
    if (out.verdict !== "over" || !cp || rate == null) return out;
    var toDep = cp[1] / 100; if (toDep <= 0) return out;
    var max = profile.max_monthly_won, delta = l.rent_won - max, extra = bround(delta * 12 / toDep);
    var alt = baseCost(l.deposit_won + extra, max, profile.own_cash_won, rates);
    if (alt.verdict === "ok" || alt.verdict === "border") {
      out.alt = { deposit_won: l.deposit_won + extra, rent_won: max, total: alt.display_total,
        note: "월세→보증금 " + cp[1].toFixed(1) + "% 전환 시 보증금 " + (l.deposit_won + extra).toLocaleString() + "원 / 월세 " + max.toLocaleString() + "원 → 월 " + alt.display_total.toLocaleString() + "원" };
      out.verdict = "border";
    }
    return out;
  }

  // ---- 지역 ----
  function regionPoints(l, profile) {
    var regs = profile.regions || [];
    if (!regs.length) return { points: 0, matched: null };
    var best = null;
    regs.forEach(function (r) {
      if (!r.name) return;
      var hit = (r.name === l.sigungu || r.name === l.gu || r.name === l.sido);
      if (!hit && r.name.length >= 2 && !/[시군구도]$/.test(r.name)) {
        // 동·지명 키워드(예: 청라): 주소의 시군구 뒤 부분에서만 찾는다 (서울 '청라로' 같은 도로명 오매칭 방지)
        var addr = l.address || ""; var tail = l.sigungu && addr.indexOf(l.sigungu) >= 0 ? addr.slice(addr.indexOf(l.sigungu) + l.sigungu.length) : addr;
        hit = new RegExp(r.name + "(동|읍|면|지구|\\s|\\d|$)").test(tail);
      }
      if (hit && (!best || r.points > best.points)) best = r;
    });
    return best ? { points: best.points, matched: best.name } : null;
  }
  function applicableUnits(l) {
    if (l.units_youth == null && l.units_general == null) return (/추가모집|잔여/.test(l.name || "")) ? null : l.units_total;
    return (l.units_youth || 0) + (l.units_general || 0);
  }
  function isBig(l) { var n = applicableUnits(l); return n != null && n >= R.BIG_RECRUIT_UNITS; }
  function yearsAvailable(l, today) {
    if (l.max_years != null) return l.max_years;
    if (l.end_year != null) { var start = (l.movein && /^\d{4}/.test(l.movein)) ? parseInt(l.movein.slice(0, 4), 10) : parseInt(today.slice(0, 4), 10) + 1; return l.end_year - start; }
    return null;
  }

  // ---- 필터 ----
  function applyFilters(l, profile, ctx, today) {
    var reasons = [], unscored = [];
    if (l.apply_end && l.apply_end < today) return ["closed", ["접수 종료 (" + l.apply_end + ")"]];
    if (ctx.region === null) return ["rejected", ["내 지역 목록에 없음 (" + (l.sigungu || l.sido || "지역 미확인") + ")"]];
    if (!l.sigungu && !l.gu) unscored.push("구 미확인");
    var minM2 = profile.min_pyeong * R.M2_PER_PYEONG;
    if (l.area_m2_max == null) unscored.push("면적 미확인");
    else if (l.area_m2_max < minM2 - 1e-9) reasons.push(profile.min_pyeong + "평 미만 (전용 " + l.area_m2_max.toFixed(1) + "㎡ = " + toPyeong(l.area_m2_max).toFixed(1) + "평)");
    if (l.is_private) {
      var y = yearsAvailable(l, today);
      if (y == null) unscored.push("민간 거주가능기간 미확인");
      else if (y < profile.min_private_years) reasons.push("민간임대 거주 가능 " + y + "년 < " + profile.min_private_years + "년");
    }
    var v = ctx.monthly.verdict;
    if (v === "over") reasons.push("월 납입액 " + ctx.monthly.display_total.toLocaleString() + "원 > " + profile.max_monthly_won.toLocaleString() + "원");
    else if (v === "unknown") unscored.push("월 납입액 미산정");
    if (ctx.transit_min == null) unscored.push("교통시간 미산정");
    if (reasons.length) return ["rejected", reasons];
    if (unscored.length) return ["unscored", unscored];
    if (v === "border") return ["border", ["월 납입액 경계 (" + ctx.monthly.display_total.toLocaleString() + "원)"]];
    return ["passed", []];
  }
  function bucketDesc(v, t) { for (var i = 0; i < t.length; i++) if (v <= t[i][0]) return t[i][1]; return 0; }
  function bucketAsc(v, t) { var p = 0; for (var i = 0; i < t.length; i++) if (v >= t[i][0]) p = t[i][1]; return p; }

  // ---- 점수 ----
  function score(l, profile, ctx, today) {
    var notes = [];
    var transit = ctx.transit_min != null ? bucketDesc(ctx.transit_min, R.TRANSIT_POINTS) : 0;
    var gu = ctx.region ? ctx.region.points : 0;
    var area = l.area_m2_max != null ? bucketAsc(toPyeong(l.area_m2_max), R.AREA_POINTS) : 0;
    var y = yearsAvailable(l, today), years = y != null ? bucketAsc(y, R.YEARS_POINTS) : 0;
    var un = applicableUnits(l), units = un != null ? bucketAsc(un, R.UNITS_POINTS) : 0;
    if (l.units_youth == null && l.units_general == null && l.units_total != null) notes.push("모집호수는 전체 기준");
    var bonus = 0, workLines = (profile.work && profile.work.lines) || [];
    if (intersects(l.station_lines, workLines) && l.station_walk_min != null && l.station_walk_min <= R.LINE_WALK_MAX) { bonus += R.LINE_BONUS; notes.push("직장 노선 역세권 +" + R.LINE_BONUS); }
    if (["1.5룸", "2룸", "3룸"].indexOf(l.rooms) >= 0) { bonus += R.ROOM_BONUS; notes.push(l.rooms + " +" + R.ROOM_BONUS); }
    if (l.units_total != null && l.units_total >= R.BIG_COMPLEX_UNITS) { bonus += R.BIG_COMPLEX_BONUS; notes.push("대단지 +" + R.BIG_COMPLEX_BONUS); }
    return { transit: transit, gu: gu, area: area, years: years, units: units, bonus: bonus, total: transit + gu + area + years + units + bonus, notes: notes };
  }

  // ---- 자격 ----
  function judge(l, profile, today) {
    var r = RULES[l.type];
    if (!r) return ["조건부", "유형 미분류 — 공고문에서 자격 직접 확인"];
    var age = parseInt(today.slice(0, 4), 10) - profile.birth_year;
    if (age < r.age[0] || age > r.age[1]) return ["불가", "나이 " + age + "세 (기준 " + r.age[0] + "~" + r.age[1] + ")"];
    if (r.single && profile.marital !== "single") return ["불가", "미혼만 가능"];
    var reasons = [], checks = [];
    var inc = profile.income_annual_won / 12;
    if (r.income != null) { if (inc > r.income) return ["불가", "소득 월 " + Math.round(inc).toLocaleString() + "원 > 기준 " + r.income.toLocaleString() + "원"]; reasons.push("소득 " + Math.floor(inc / 10000) + "만 ≤ " + Math.floor(r.income / 10000) + "만"); }
    if (r.asset != null) { if ((profile.savings_won || 0) > r.asset) return ["불가", "총자산 " + (profile.savings_won || 0).toLocaleString() + "원 > 기준 " + r.asset.toLocaleString() + "원"]; reasons.push("자산 OK"); }
    if (profile.car) checks.push("자동차가액 4,542만 이하 확인");
    if (r.account && !profile.subscription_joined) checks.push("청약통장 가입일·납입횟수 확인(순위 결정)");
    if (r.rank1 && profile.residence_sido && l.sido && (profile.residence_sido === l.sido)) reasons.unshift(profile.residence_sido + " 거주·직장 → 1순위");
    if (checks.length) return ["조건부", reasons.concat(checks).join("; ") + " · " + r.note];
    return ["가능", (reasons.length ? reasons.join("; ") + " · " : "가능 · ") + r.note];
  }

  function evaluate(l, profile, stations, today) {
    today = today || new Date().toISOString().slice(0, 10);
    var tr = (l.lat != null || l.station_lat != null) ? transitEstimate(l, profile, stations) : null;
    var ctx = { transit_min: tr ? tr.minutes : null, region: regionPoints(l, profile), monthly: monthlyCost(l, profile) };
    var fs = applyFilters(l, profile, ctx, today);
    var sc = score(l, profile, ctx, today);
    var el = judge(l, profile, today);
    return { transit_min: ctx.transit_min, transit_mode: tr ? "estimate" : null, transit_detail: tr ? tr.detail : null,
      monthly: ctx.monthly, status: fs[0], status_reasons: fs[1], score: sc, eligibility: el[0], eligibility_note: el[1],
      region_points: ctx.region ? ctx.region.points : null, region_matched: ctx.region ? ctx.region.matched : null, is_big: isBig(l) };
  }

  return { evaluate: evaluate, transitEstimate: transitEstimate, monthlyCost: monthlyCost, regionPoints: regionPoints, applyFilters: applyFilters, score: score, judge: judge,
    nearestStation: nearestStation, toPyeong: toPyeong, applicableUnits: applicableUnits, isBig: isBig, RULES: R };
});

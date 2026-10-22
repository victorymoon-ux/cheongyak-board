/* engine.js — 브라우저에서 각자 조건(profile)으로 공고(facts)를 계산한다.
   Python(cheongyak/rules.py·cost.py·score.py·eligibility.py)과 같은 규칙. 바꾸면 양쪽 다 + tests/test_engine.py 로 교차 확인. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./schedule.js"));
  else root.Engine = factory(root.Schedule);
})(typeof self !== "undefined" ? self : this, function (Schedule) {
  "use strict";
  var R = {
    M2_PER_PYEONG: 3.3058,
    TRANSIT_POINTS: [[20, 40], [30, 32], [40, 24], [50, 14], [60, 6]],
    AREA_POINTS: [[9, 5], [11, 10], [13, 15], [15, 20]],
    YEARS_POINTS: [[4, 5], [6, 10]],
    UNITS_POINTS: [[10, 4], [30, 8], [100, 12], [300, 15]],
    LINE_BONUS: 5, LINE_WALK_MAX: 10, ROOM_BONUS: 5, ROOM_BONUS_2: 8, BIG_COMPLEX_BONUS: 2, BIG_COMPLEX_UNITS: 300, BIG_RECRUIT_UNITS: 100,
    SUBWAY_KMH: 32, DETOUR: 1.25, TRANSFER_MIN: 8, WAIT_MIN: 4, WORK_WALK_MIN: 3,
    POLICY_MAX_DEPOSIT_WON: 300000000, SUPPORT_MAX_RENT_WON: 900000
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
    var out = { loan_won: 0, interest_youth: null, interest_bank: null, total_youth: null, total_bank: null, display_total: null, verdict: "unknown", alt: null, policy_note: null };
    if (dep == null || rent == null || own == null) return out;
    var loan = Math.max(0, dep - own); out.loan_won = loan;
    var iy = null;
    var ib = loan === 0 ? 0 : interest(loan, rates.bank_loan);
    out.policy_note = "입력한 일반은행 금리의 비용 예시 · 대출 승인/한도 미확인 · 서울시 이자지원 자동 할인 없음";
    out.interest_youth = iy; out.interest_bank = ib;
    out.total_youth = iy != null ? rent + iy : null; out.total_bank = ib != null ? rent + ib : null;
    if (out.total_youth != null) out.display_total = out.total_youth;
    else if (out.total_bank != null) out.display_total = out.total_bank;
    else { out.display_total = rent; if (loan > 0) { out.display_total = null; return out; } }
    var t = out.display_total, max = rates._max || 800000, border = rates._border || 850000;
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
    out.support_checks = supportChecks(l, profile);
    var cp = parseConvertPct(l.convert_note);
    var rate = rates.bank_loan;
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
    if (Schedule.phase(l, today === Schedule.today() ? new Date() : new Date(today + "T12:00:00+09:00")).k === "closed") return ["closed", ["접수 종료 (" + l.apply_end + ")"]];
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
    var rm = l.rooms || "";
    if (/2룸|3룸|투룸/.test(rm)) { bonus += R.ROOM_BONUS_2; notes.push("2룸 이상 +" + R.ROOM_BONUS_2); }
    else if (rm.indexOf("1.5룸") >= 0) { bonus += R.ROOM_BONUS; notes.push("1.5룸 +" + R.ROOM_BONUS); }
    if (l.units_total != null && l.units_total >= R.BIG_COMPLEX_UNITS) { bonus += R.BIG_COMPLEX_BONUS; notes.push("대단지 +" + R.BIG_COMPLEX_BONUS); }
    return { transit: transit, gu: gu, area: area, years: years, units: units, bonus: bonus, total: transit + gu + area + years + units + bonus, notes: notes };
  }

  // ---- 자격 ----
  function eligibilityChecks(l, profile) {
    var labels = (l.application_periods || []).map(function(p) { return p.label || "공급유형 확인 필요"; });
    if (!labels.length) labels = [l.type + " · 공급유형 확인 필요"];
    return labels.map(function(label) { return { supply:label, status:"확인 필요", checks:[
      "공고별 자격 기준일·정확한 만나이 확인 필요 (생년만으로 판정하지 않음)",
      profile.homeless === false ? "입력상 주택 보유 · 공고의 주택수 산정 및 적용 범위 확인 필요" : "본인·배우자·세대구성원 중 무주택 적용 범위와 증빙 확인 필요",
      "공고별 소득 상한·산정기간·본인/가구/부모 합산 범위 확인 필요",
      "총자산·자동차 평가액·부채 공제 범위 확인 필요 (예적금만으로 판정하지 않음)",
      "거주기간·직장·혼인·청약통장 등 공급유형별 요건 및 순위 확인 필요"
    ]}; });
  }
  function judge(l, profile, today) {
    return ["확인 필요", "공고별 공급유형과 심사 범위를 확인해야 합니다. 입력값만으로 신청 자격이나 당첨·대출 승인을 확정하지 않습니다."];
  }
  function supportChecks(l, p) {
    var reasons = [];
    var region = l.sido || (/^서울/.test(l.address || "") ? "서울" : null);
    reasons.push(region === "서울" ? "서울 소재: 확인된 공고 주소 기준" : region ? "서울 밖 주택: 지원 대상 아님" : "주택 소재지 확인 필요");
    reasons.push(l.is_private === false ? "공공임대 등 지원 제외 주택 여부 확인 필요 · 자동 할인 없음" : "건축물 용도·위반건축물·공공임대 제외 여부 확인 필요");
    if (l.deposit_won == null || l.rent_won == null) reasons.push("보증금·월세 확인 필요");
    else if (l.deposit_won > 300000000 || l.rent_won > 900000) reasons.push("보증금 3억원·월세 90만원 기준 초과");
    if (p.marital === "single" && p.income_annual_won != null && p.income_annual_won > 50000000) reasons.push("개인 연소득 5천만원 기준 초과");
    else reasons.push("은행 산정 연소득 확인 필요 (미혼 개인 5천만원 / 기혼 부부합산 6천만원)");
    reasons.push("신청일 만19~39세·본인/배우자 무주택·세대주·서울 전입 요건 확인 필요");
    reasons.push("주거급여·기존 지원 이력·은행 보증/대출 심사 확인 필요");
    reasons.push("협약대출 최대 2억원·보증금 90% 이내. 지원분 기본 연2%p, 본인부담 최저 연1% (고정 1%가 아님). 버팀목 등과 임의 혼합하지 않음");
    return reasons;
  }

  function evaluate(l, profile, stations, today) {
    today = today || Schedule.today();
    var tr = (l.lat != null || l.station_lat != null) ? transitEstimate(l, profile, stations) : null;
    var ctx = { transit_min: tr ? tr.minutes : null, region: regionPoints(l, profile), monthly: monthlyCost(l, profile) };
    var fs = applyFilters(l, profile, ctx, today);
    var sc = score(l, profile, ctx, today);
    var el = judge(l, profile, today);
    return { transit_min: ctx.transit_min, transit_mode: tr ? "estimate" : null, transit_detail: tr ? tr.detail : null,
      monthly: ctx.monthly, status: fs[0], status_reasons: fs[1], score: sc, eligibility: el[0], eligibility_note: el[1], eligibility_checks: eligibilityChecks(l, profile),
      region_points: ctx.region ? ctx.region.points : null, region_matched: ctx.region ? ctx.region.matched : null, is_big: isBig(l) };
  }

  return { evaluate: evaluate, transitEstimate: transitEstimate, monthlyCost: monthlyCost, regionPoints: regionPoints, applyFilters: applyFilters, score: score, judge: judge,
    supportChecks: supportChecks, eligibilityChecks: eligibilityChecks, nearestStation: nearestStation, toPyeong: toPyeong, applicableUnits: applicableUnits, isBig: isBig, RULES: R };
});

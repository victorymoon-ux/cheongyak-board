/* All clock times are Asia/Seoul. Missing times are never replaced with invented times. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Schedule = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function today(now) { return new Date(+(now || new Date()) + 9 * 3600000).toISOString().slice(0, 10); }
  function periods(l) { return l.application_periods && l.application_periods.length ? l.application_periods : [{ label: '접수', start: l.apply_start, end: l.apply_end, start_time: l.apply_start_time, end_time: l.apply_end_time }]; }
  function announcements(l) { return l.announcements && l.announcements.length ? l.announcements : (l.announce_date ? [{ kind: 'unknown', date: l.announce_date }] : []); }
  function label(a) { return a.kind === 'documents' ? '서류대상자 발표' : a.kind === 'winner' ? '최종 당첨 발표' : '발표 (단계 확인 필요)'; }
  function at(date, time) { return date ? date + ' ' + (time || '시각 확인 필요') : '일정 확인 필요'; }
  function range(p) { return at(p.start, p.start_time) + ' ~ ' + at(p.end, p.end_time); }
  function phasePeriod(p, now) {
    now = now || new Date(); var day = today(now);
    function stamp(d, t) { return new Date(d + 'T' + t + ':00+09:00'); }
    if (p.start && (day < p.start || (p.start_time && now < stamp(p.start, p.start_time)))) return 'upcoming';
    if (p.end && (day > p.end || (p.end_time && now >= stamp(p.end, p.end_time)))) return 'closed';
    if (!p.start && !p.end) return 'unknown';
    // On an unverified boundary day do not claim that applications are open now.
    if (!p.start || !p.end || (day === p.start && !p.start_time) || (day === p.end && !p.end_time)) return 'unknown';
    return 'open';
  }
  function phase(l, now) {
    now = now || new Date();
    var ps = periods(l).slice().sort(function(a,b) { return (a.start || '').localeCompare(b.start || ''); });
    var kinds = ['open', 'upcoming', 'unknown', 'closed'];
    for (var i = 0; i < kinds.length; i++) {
      var matches = ps.filter(function(p) { return phasePeriod(p, now) === kinds[i]; });
      if (matches.length) {
        var p = kinds[i] === 'closed' ? matches[matches.length - 1] : matches[0];
        var days = p.end ? Math.round((new Date(p.end) - new Date(today(now))) / 864e5) : null;
        return { k: kinds[i], period: p, urgent: kinds[i] === 'open' && days !== null && days <= 4,
          text: (kinds[i] === 'open' ? '접수 중' : kinds[i] === 'upcoming' ? '접수 예정' : kinds[i] === 'closed' ? '접수 종료' : '접수 시각 확인 필요') + ' · ' + (p.label || '접수'), sub: range(p) + ' (한국시간)' };
      }
    }
  }
  function events(l) {
    var out = [];
    periods(l).forEach(function(p) {
      if (p.start) out.push({date:p.start, time:p.start_time, label:(p.label || '접수') + ' 시작', kind:'start'});
      if (p.end) out.push({date:p.end, time:p.end_time, label:(p.label || '접수') + ' 마감', kind:'end'});
    });
    announcements(l).forEach(function(a) { out.push({date:a.date,time:a.time,label:label(a),kind:'ann',after:a.after}); });
    return out.sort(function(a,b) { return (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')); });
  }
  return { today:today, periods:periods, announcements:announcements, label:label, at:at, range:range, phase:phase, phasePeriod:phasePeriod, events:events };
});

(() => {
  function read(key) {
    try {
      const v = sessionStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }

  function write(key, value) {
    sessionStorage.setItem(key, JSON.stringify(value));
  }

  const schedule = read("schedule") || [];
  if (!schedule.length) return;

  const now = new Date();

  function parseTime(t) {
    if (!t) return null;
    const d = new Date();
    const [hh, mm, ss] = String(t).split(":");
    if (!hh || !mm) return null;
    d.setHours(+hh, +mm, +(ss || 0), 0);
    return d;
  }

  function minsDiff(a, b) {
    return Math.round((a - b) / 60000);
  }

  const derived = schedule.map(cls => {
    const status = cls.status || "upcoming";

    const startTime =
      parseTime(cls.estimated_start_time) ||
      parseTime(cls.start_time_default);

    const goTime = parseTime(cls.estimated_go_time);
    const endTime = parseTime(cls.estimated_end_time);

    const out = { ...cls };

    // -------------------------
    // UPCOMING — CLASS START
    // -------------------------
    if (status === "upcoming" && startTime) {
      const diff = minsDiff(startTime, now);
      out.class_notif60 = diff <= 60 && diff > 30;
      out.class_notif30 = diff <= 30 && diff > 0;
    } else {
      out.class_notif60 = false;
      out.class_notif30 = false;
    }

    // -------------------------
    // UPCOMING — GO TIME
    // -------------------------
    if (status === "upcoming" && goTime) {
      const diff = minsDiff(goTime, now);
      out.go_notif60 = diff <= 60 && diff > 30;
      out.go_notif30 = diff <= 30 && diff > 0;
    } else {
      out.go_notif60 = false;
      out.go_notif30 = false;
    }

    // -------------------------
    // LIVE CHECK
    // -------------------------
    if (status === "upcoming" && endTime) {
      out.check_live = now >= endTime;
    } else {
      out.check_live = false;
    }

    // -------------------------
    // LIVE
    // -------------------------
    out.live_notifNow = status === "live";

    // -------------------------
    // COMPLETED
    // -------------------------
    out.completed_notifDone = status === "completed";

    return out;
  });

  write("schedule_derived", derived);

  write("_trainer_meta", {
    derived_at: new Date().toISOString(),
    count: derived.length
  });

  console.log("[TRAINER] derived schedule ready", derived.length);
})();

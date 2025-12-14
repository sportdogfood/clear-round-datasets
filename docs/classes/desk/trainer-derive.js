// docs/classes/desk/trainer-derive.js
// NO EXPORTS — attaches to window

(function () {
  function deriveTrainer(payload) {
    if (!payload || !payload.entries) return [];

    const out = [];

    payload.entries.forEach(e => {
      if (!e.class_data) return;

      out.push({
        time: e.entry_class?.estimated_go_time || null,
        horse: e.horse || null,
        ring: e.class_data.ring || null,
        class_name: e.class_data.class_name || null,
        class_group_id: e.class_data.class_group_id || null,
        class_number: e.class_data.class_number || null,
        class_type: e.class_data.class_type || null,
        is_morning: e.is_morning || false,
        order_of_go: e.entry_class?.order_of_go ?? null
      });
    });

    return out;
  }

  window.trainerDerive = deriveTrainer;
})();

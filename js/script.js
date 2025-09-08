$(function () {
  /* ---------------------------
   DATA MODEL & STORAGE
   --------------------------- */
  let projects = JSON.parse(localStorage.getItem("projects") || "[]");
  let tasks = JSON.parse(localStorage.getItem("tasks") || "[]");
  // user settings for auto rules + reminders
  let settings = JSON.parse(localStorage.getItem("scrumIQSettings") || "{}");
  if (settings.reminderOffset === undefined) settings.reminderOffset = 10;
  if (settings.ruleAutoBugToTodo === undefined) settings.ruleAutoBugToTodo = true;
  if (settings.ruleChecklistToQA === undefined) settings.ruleChecklistToQA = true;

  function saveAll() {
    localStorage.setItem("projects", JSON.stringify(projects));
    localStorage.setItem("tasks", JSON.stringify(tasks));
    localStorage.setItem("scrumIQSettings", JSON.stringify(settings));
  }

  /* ---------------------------
   DARK MODE
   --------------------------- */
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme:dark)").matches;
  let storedTheme = localStorage.getItem("scrumIQTheme");
  const initialDark = storedTheme === null ? systemPrefersDark : storedTheme === "dark";
  if (initialDark) document.body.setAttribute("data-bs-theme", "dark");
  $("#darkModeToggle").prop("checked", initialDark);
  $("#darkModeToggle").on("change", function () {
    const on = this.checked;
    document.body.setAttribute("data-bs-theme", on ? "dark" : "light");
    localStorage.setItem("scrumIQTheme", on ? "dark" : "light");
  });

  /* ---------------------------
   UTIL
   --------------------------- */
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }
  function findTask(id) {
    return tasks.find((t) => t.id == id);
  }
  function findProject(i) {
    return projects[i] || { name: "Unknown", color: "#6c757d" };
  }

  /* ---------------------------
   RENDER HELPERS
   --------------------------- */
  function formatDue(d) {
    if (!d) return "";
    const dt = new Date(d);
    if (isNaN(dt)) return "";
    return dt.toLocaleString();
  }

  function checklistProgress(task) {
    if (!task.checklist || task.checklist.length === 0) return 0;
    const total = task.checklist.length;
    const done = task.checklist.filter((i) => i.done).length;
    return Math.round((done / total) * 100);
  }

  function renderCard(task) {
    const p = findProject(task.project);
    const $card = $(`
    <div class="card" data-id="${task.id}" style="background:${escapeHtml(p.color)}; display:none;">
      <div class="project-pill">${escapeHtml(p.name)}</div>
      <div class="title">${escapeHtml(task.title)}</div>
      <div class="meta-row">
        <div class="priority-pill bg-white bg-opacity-10">${escapeHtml(task.priority || "Medium")}</div>
        ${task.tags && task.tags.length ? task.tags.map((t) => `<div class="badge-tag">${escapeHtml(t)}</div>`).join("") : ""}
        ${task.due ? `<div class="badge-tag" title="Due">${escapeHtml(formatDue(task.due))}</div>` : ""}
        ${task.checklist && task.checklist.length ? `<div class="check-progress">${checklistProgress(task)}% ✓</div>` : ""}
      </div>
      ${task.stage === "done" ? '<span class="close-btn">&times;</span>' : ""}
    </div>
  `);
    return $card;
  }

  function renderRow(task) {
    const p = findProject(task.project);
    return $(`
    <tr data-id="${task.id}" style="display:none;">
      <td>${escapeHtml(task.title)}</td>
      <td>${escapeHtml(task.type)}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${task.due ? escapeHtml(new Date(task.due).toLocaleString()) : ""}</td>
    </tr>
  `);
  }

  /* ---------------------------
   RENDER FULL BOARD (called when adding/removing or initial load)
   --------------------------- */
  function renderProjectsSelect() {
    $("#taskProject").empty();
    projects.forEach((p, i) => $("#taskProject").append(`<option value="${i}">${escapeHtml(p.name)}</option>`));
  }

  function renderTasks() {
    $(".droppable").empty();
    const $tbody = $("#backlogTable tbody").empty();

    let backlogEmpty = true;
    tasks.forEach((t) => {
      if (t.closed) return;
      if (t.stage === "backlog") {
        backlogEmpty = false;
        $tbody.append(renderRow(t));
      } else {
        $('.column[data-stage="' + t.stage + '"] .droppable').append(renderCard(t));
      }
    });

    if (backlogEmpty) {
      $tbody.append(`<tr class="placeholder" data-id="placeholder"><td colspan="4" class="text-center text-muted fst-italic">Drag tasks here to add to backlog</td></tr>`);
    }

    // show with fade
    $(".card").fadeIn(140);
    $("#backlogTable tbody tr").not(".placeholder").fadeIn(140);

    // re-init sortable (keeps your original logic unchanged)
    makeSortable();
  }

  /* ---------------------------
   SORTABLE (kept as-is)
   --------------------------- */
  function makeSortable() {
    // original sortable code preserved with slight binding to helper classes (keeps original behaviour)
    if ($(".droppable").hasClass("ui-sortable")) $(".droppable").sortable("destroy");
    if ($("#backlogTable tbody").hasClass("ui-sortable")) $("#backlogTable tbody").sortable("destroy");

    $(".droppable")
      .sortable({
        connectWith: ".droppable, #backlogTable tbody",
        placeholder: "ghost-placeholder",
        items: "> .card",
        tolerance: "pointer",
        helper: "clone",
        cursorAt: { top: 20, left: 20 },
        start: function (e, ui) {
          ui.helper.addClass("card-helper");
          ui.helper.css("width", ui.item.outerWidth());
        },
        update: function (e, ui) {
          const $item = ui.item;
          if (!$item || !$item.length) return;
          if ($item.is(".card")) {
            const id = $item.data("id");
            const task = findTask(id);
            if (task) {
              const newStage = $item.closest(".column").data("stage");
              if (task.stage !== newStage) {
                task.stage = newStage;
                saveAll();
              }
            }
          }
          $(this).closest(".column").removeClass("highlight");
        },
        receive: function (e, ui) {
          const $incoming = ui.item;
          const newStage = $(this).closest(".column").data("stage");
          if ($incoming.is("tr")) {
            const id = $incoming.data("id");
            const task = findTask(id);
            if (!task) return;
            const $card = renderCard(task).hide();
            $incoming.replaceWith($card);
            $card.fadeIn(140);
            task.stage = newStage;
            saveAll();
            // ensure backlog placeholder presence if empty
            const $rows = $("#backlogTable tbody tr").not(".placeholder");
            if ($rows.length === 0) $("#backlogTable tbody").append(`<tr class="placeholder" data-id="placeholder"><td colspan="4">Drag tasks here to add to backlog</td></tr>`);
            $(".droppable").sortable("refresh");
            $("#backlogTable tbody").sortable("refresh");
          } else if ($incoming.is(".card")) {
            const id = $incoming.data("id");
            const task = findTask(id);
            if (!task) return;
            task.stage = newStage;
            saveAll();
            $incoming.hide().fadeIn(120);
          }
        },
      })
      .disableSelection();

    $("#backlogTable tbody")
      .sortable({
        connectWith: ".droppable",
        placeholder: "ghost-placeholder table-row",
        items: "> tr:not(.placeholder)",
        tolerance: "pointer",
        cursorAt: { top: 20, left: 20 },
        helper: function (e, tr) {
          const id = $(tr).data("id");
          const task = findTask(id) || {};
          const p = findProject(task.project);
          const $h = $(
            `<div class="card card-helper" style="background:${escapeHtml(p.color)};"><div class="project-pill">${escapeHtml(p.name)}</div><div class="title">${escapeHtml(
              task.title || ""
            )}</div></div>`
          );
          $h.css("min-width", "180px");
          return $h;
        },
        start: function (e, ui) {
          ui.helper.css("width", Math.max(180, ui.helper.width()));
        },
        receive: function (e, ui) {
          const $incoming = ui.item;
          if ($incoming.is(".card")) {
            $(".backlog-placeholder").remove();
            const id = $incoming.data("id");
            const task = findTask(id);
            if (!task) return;
            const $row = renderRow(task).hide();
            $incoming.replaceWith($row);
            $row.fadeIn(120);
            task.stage = "backlog";
            saveAll();
            $("#backlogTable tbody tr.placeholder").remove();
            $(".droppable").sortable("refresh");
            $("#backlogTable tbody").sortable("refresh");
          }
        },
        update: function (e, ui) {
          const $item = ui.item;
          if ($item.is("tr")) {
            const id = $item.data("id");
            const task = findTask(id);
            if (task && task.stage !== "backlog") {
              task.stage = "backlog";
              saveAll();
            }
          }
          $(this).removeClass("highlight");
        },
      })
      .disableSelection();
  }

  /* ---------------------------
   NOTIFICATIONS / REMINDERS
   --------------------------- */
  // request permission if needed
  function ensureNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") Notification.requestPermission();
  }

  // schedule reminders for tasks with due date (one-shot per task)
  const reminderTimers = {};
  function scheduleReminders() {
    // clear existing
    Object.values(reminderTimers).forEach((t) => clearTimeout(t));
    for (const task of tasks) {
      if (!task.due) continue;
      if (task.notified) continue; // we mark after notifying
      const due = new Date(task.due).getTime();
      if (isNaN(due)) continue;
      const offsetMin = Number(settings.reminderOffset || 10);
      const notifyAt = due - offsetMin * 60 * 1000;
      const now = Date.now();
      if (notifyAt <= now) {
        // due soon/past -> notify immediately if not already done
        triggerNotification(task);
        task.notified = true;
        saveAll();
      } else {
        const id = task.id;
        const ms = notifyAt - now;
        reminderTimers[id] = setTimeout(() => {
          triggerNotification(task);
          task.notified = true;
          saveAll();
        }, ms);
      }
    }
  }
  function triggerNotification(task) {
    ensureNotificationPermission();
    if (Notification.permission === "granted") {
      const title = `Reminder: ${task.title}`;
      const body = task.description ? task.description.slice(0, 120) : "";
      new Notification(title, { body });
    } else {
      // fallback: small visual highlight flash on the card
      const sel = `.card[data-id="${task.id}"]`;
      const $c = $(sel);
      if ($c.length) {
        $c.animate({ opacity: 0.4 }, 150).animate({ opacity: 1 }, 150);
      }
    }
  }

  /* ---------------------------
   SEARCH / FILTER
   --------------------------- */
  function applySearchFilter(q) {
    q = String(q || "")
      .trim()
      .toLowerCase();
    if (!q) {
      $(".card, #backlogTable tbody tr").removeClass("d-none");
      $(".placeholder").removeClass("d-none");
      return;
    }
    $(".placeholder").addClass("d-none");
    // cards
    $(".card").each(function () {
      const $c = $(this);
      const id = $c.data("id");
      const task = findTask(id);
      if (!task) {
        $c.addClass("d-none");
        return;
      }
      const hay = ((task.title || "") + " " + (task.description || "") + " " + (task.tags ? task.tags.join(" ") : "")).toLowerCase();
      if (hay.indexOf(q) !== -1) $c.removeClass("d-none");
      else $c.addClass("d-none");
    });
    // backlog rows
    $("#backlogTable tbody tr")
      .not(".placeholder")
      .each(function () {
        const $r = $(this);
        const id = $r.data("id");
        const task = findTask(id);
        if (!task) {
          $r.addClass("d-none");
          return;
        }
        const hay = ((task.title || "") + " " + (task.description || "") + " " + (task.tags ? task.tags.join(" ") : "")).toLowerCase();
        if (hay.indexOf(q) !== -1) $r.removeClass("d-none");
        else $r.addClass("d-none");
      });
  }

  /* ---------------------------
   IMPORT / EXPORT JSON
   --------------------------- */
  function exportJSON() {
    const payload = { projects, tasks, settings, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scrumIQ_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const payload = JSON.parse(e.target.result);
        if (!payload || (!payload.tasks && !payload.projects && !payload.settings)) {
          if (!confirm("No recognizable data found. Replace existing data anyway?")) return;
        }
        if (confirm("Replace current data with imported data? This cannot be undone.")) {
          projects = payload.projects || [];
          tasks = payload.tasks || [];
          settings = payload.settings || settings;
          saveAll();
          renderProjectsSelect();
          renderTasks();
          scheduleReminders();
        }
      } catch (err) {
        alert("Import failed: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  /* ---------------------------
   CHECKLIST UI (task modal)
   --------------------------- */
  function renderChecklist(container, checklist) {
    container.empty();
    checklist = checklist || [];
    checklist.forEach((item, idx) => {
      const $row = $(`
      <div class="input-group input-group-sm mb-1" data-idx="${idx}">
        <div class="input-group-text"><input type="checkbox" class="form-check-input checklist-checkbox" ${item.done ? "checked" : ""}></div>
        <input type="text" class="form-control checklist-text" value="${escapeHtml(item.text)}">
        <button class="btn btn-outline-danger btn-sm checklist-remove" type="button">&times;</button>
      </div>
    `);
      container.append($row);
    });
  }

  /* ---------------------------
   MODALS: Project, Task, Settings
   --------------------------- */
  const projectModal = new bootstrap.Modal($("#projectModal"));
  const taskModal = new bootstrap.Modal($("#taskModal"));
  const settingsModal = new bootstrap.Modal($("#settingsModal"));

  function populateProjectModal() {
    const $sel = $("#projectSelectModal").empty();
    $sel.append(`<option value="new">New Project</option>`);
    projects.forEach((p, i) => $sel.append(`<option value="${i}">${escapeHtml(p.name)}</option>`));
    $sel.val("new");
    $("#projectNameModal").val("");
    $("#projectColorModal").val("#6c757d");
  }

  $("#editProjectsBtn").on("click", () => {
    populateProjectModal();
    editingProjectIndex = null;
    $("#projectSaveBtn").text("Save");
    projectModal.show();
  });
  $("#projectSelectModal").on("change", function () {
    const v = $(this).val();
    if (v === "new") {
      editingProjectIndex = null;
      $("#projectNameModal").val("");
      $("#projectColorModal").val("#6c757d");
    } else {
      editingProjectIndex = Number(v);
      const p = projects[editingProjectIndex];
      $("#projectNameModal").val(p.name);
      $("#projectColorModal").val(p.color);
    }
  });
  $("#projectForm").on("submit", function (e) {
    e.preventDefault();
    const name = $("#projectNameModal").val().trim();
    const color = $("#projectColorModal").val();
    if (!name) {
      alert("Project name required");
      return;
    }
    if (editingProjectIndex === null) projects.push({ name, color });
    else {
      projects[editingProjectIndex].name = name;
      projects[editingProjectIndex].color = color;
    }
    saveAll();
    renderProjectsSelect();
    renderTasks();
    projectModal.hide();
  });

  /* Task modal open/create/edit */
  function openTaskModalForCreate() {
    editingTaskId = null;
    $("#taskModalTitle").text("New Task");
    $("#taskSaveBtn").text("Create");
    $("#taskTitle").val("");
    $("#taskProject").val(0);
    $("#taskType").val("Story");
    $("#taskPriority").val("Medium");
    $("#taskDue").val("");
    $("#taskTags").val("");
    $("#taskDescription").val("");
    renderChecklist($("#checklistContainer"), []);
    taskModal.show();
  }

  $("#newTaskBtn").on("click", () => {
    openTaskModalForCreate();
  });

  $(document).on("click", ".card", function (e) {
    // ignore clicks on interactive elements like close button
    if ($(e.target).closest(".close-btn").length) return;
    const id = $(this).data("id");
    const task = findTask(id);
    if (!task) return;
    editingTaskId = id;
    $("#taskModalTitle").text("Edit Task");
    $("#taskSaveBtn").text("Update");
    $("#taskTitle").val(task.title);
    $("#taskProject").val(task.project);
    $("#taskType").val(task.type || "Story");
    $("#taskPriority").val(task.priority || "Medium");
    $("#taskDue").val(task.due ? new Date(task.due).toISOString().slice(0, 16) : "");
    $("#taskTags").val((task.tags || []).join(","));
    $("#taskDescription").val(task.description || "");
    renderChecklist($("#checklistContainer"), task.checklist || []);
    taskModal.show();
  });

  /* add checklist entry */
  $("#addChecklistItem").on("click", () => {
    const text = $("#newChecklistText").val().trim();
    if (!text) return;
    const $c = $("#checklistContainer");
    const current = $c.children().length;
    const tmp = [{ text, done: false }];
    renderChecklist(
      $c,
      (function () {
        // reconstruct from existing then push
        const items = [];
        $c.find(".input-group").each(function () {
          items.push({ text: $(this).find(".checklist-text").val(), done: $(this).find(".checklist-checkbox").prop("checked") });
        });
        items.push({ text, done: false });
        return items;
      })()
    );
    $("#newChecklistText").val("");
  });

  /* dynamic checklist remove/change handlers */
  $(document).on("click", ".checklist-remove", function () {
    const $c = $("#checklistContainer");
    const items = [];
    $c.find(".input-group").each(function (idx) {
      if (this !== $(this)[0]) {
      } // noop
    });
    // rebuild excluding removed
    const newItems = [];
    $c.find(".input-group").each(function () {
      const $this = $(this);
      if ($this.find(".checklist-remove")[0] === this) {
      }
    });
    // simpler: rebuild from DOM after removing parent then render
    $(this).closest(".input-group").remove();
  });

  /* allow toggling checklist checkbox to update internal state when saving - no special live UI here */

  /* Task form submit */
  $("#taskForm").on("submit", function (e) {
    e.preventDefault();
    const title = $("#taskTitle").val().trim();
    if (!title) {
      alert("Title required");
      return;
    }
    const projectIdx = Number($("#taskProject").val() || 0);
    const type = $("#taskType").val();
    const priority = $("#taskPriority").val();
    const dueVal = $("#taskDue").val();
    const due = dueVal ? new Date(dueVal).toISOString() : null;
    const tags = $("#taskTags")
      .val()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const description = $("#taskDescription").val().trim();

    // collect checklist from DOM
    const checklist = [];
    $("#checklistContainer .input-group").each(function () {
      const text = $(this).find(".checklist-text").val().trim();
      const done = $(this).find(".checklist-checkbox").prop("checked");
      if (text) checklist.push({ text, done });
    });

    if (editingTaskId === null) {
      const id = Date.now();
      // auto-stage rule on create for bugs
      let stage = "backlog";
      if (settings.ruleAutoBugToTodo && type === "Bug") stage = "todo";
      tasks.push({ id, title, project: projectIdx, type, priority, due, tags, description, checklist, stage, closed: false, notified: false });
    } else {
      const task = findTask(editingTaskId);
      if (!task) return;
      task.title = title;
      task.project = projectIdx;
      task.type = type;
      task.priority = priority;
      task.due = due;
      task.tags = tags;
      task.description = description;
      task.checklist = checklist;
      // if checklist completed and rule is on, move to QA
      if (settings.ruleChecklistToQA && checklist.length > 0 && checklist.every((i) => i.done)) {
        task.stage = "qa";
      }
    }

    saveAll();
    renderProjectsSelect();
    renderTasks();
    scheduleReminders();
    taskModal.hide();
  });

  /* quick move from backlog row: click row to open editing? we preserve previous 'move' behaviour by double-click example omitted to keep simple */

  /* delegated close button to mark closed */
  $(document).on("click", ".close-btn", function () {
    const id = $(this).closest(".card").data("id");
    const task = findTask(id);
    if (!task) return;
    task.closed = true;
    saveAll();
    $(this)
      .closest(".card")
      .fadeOut(140, function () {
        $(this).remove();
      });
  });

  /* ---------------------------
   SETTINGS modal handlers
   --------------------------- */
  $("#settingsBtn").on("click", () => {
    $("#ruleAutoBugToTodo").prop("checked", !!settings.ruleAutoBugToTodo);
    $("#ruleChecklistToQA").prop("checked", !!settings.ruleChecklistToQA);
    $("#reminderOffset").val(Number(settings.reminderOffset || 10));
    settingsModal.show();
  });
  $("#settingsForm").on("submit", function (e) {
    e.preventDefault();
    settings.ruleAutoBugToTodo = $("#ruleAutoBugToTodo").prop("checked");
    settings.ruleChecklistToQA = $("#ruleChecklistToQA").prop("checked");
    settings.reminderOffset = Number($("#reminderOffset").val() || 0);
    saveAll();
    settingsModal.hide();
    scheduleReminders();
  });

  /* ---------------------------
   SEARCH handlers
   --------------------------- */
  $("#searchInput").on("input", function () {
    applySearchFilter(this.value);
  });

  /* ---------------------------
   IMPORT / EXPORT handlers
   --------------------------- */
  $("#exportBtn").on("click", () => exportJSON());
  $("#importFile").on("change", function () {
    const file = this.files && this.files[0];
    if (file) importJSON(file);
    this.value = "";
  });

  /* ---------------------------
   Reminder scheduling on load
   --------------------------- */
  ensureNotificationPermission();
  function scheduleReminders() {
    // cancel existing timers
    if (window._scrumIQReminderTimers) {
      window._scrumIQReminderTimers.forEach((t) => clearTimeout(t));
    }
    window._scrumIQReminderTimers = [];
    const offsetMin = Number(settings.reminderOffset || 10);
    tasks.forEach((task) => {
      if (!task.due || task.notified) return;
      const dueMs = new Date(task.due).getTime();
      if (isNaN(dueMs)) return;
      const notifyAt = dueMs - offsetMin * 60 * 1000;
      const now = Date.now();
      if (notifyAt <= now) {
        // notify now
        triggerNotification(task);
        task.notified = true;
      } else {
        const ms = notifyAt - now;
        const t = setTimeout(() => {
          triggerNotification(task);
          task.notified = true;
          saveAll();
        }, ms);
        window._scrumIQReminderTimers.push(t);
      }
    });
    saveAll();
  }

  /* ---------------------------
   IMPORT/EXPORT implementations
   --------------------------- */
  function exportJSON() {
    const payload = { projects, tasks, settings, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scrumIQ_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function importJSON(file) {
    const r = new FileReader();
    r.onload = function (e) {
      try {
        const payload = JSON.parse(e.target.result);
        if (!payload) throw new Error("Invalid file");
        if (!confirm("Replace current data with imported data? This cannot be undone.")) return;
        projects = payload.projects || [];
        tasks = payload.tasks || [];
        settings = payload.settings || settings;
        saveAll();
        renderProjectsSelect();
        renderTasks();
        scheduleReminders();
      } catch (err) {
        alert("Import failed: " + err.message);
      }
    };
    r.readAsText(file);
  }

  /* ---------------------------
   INITIAL SEED / RENDER
   --------------------------- */
  if (!projects.length) {
    projects.push({ name: "Default", color: "#6c757d" });
    saveAll();
  }
  renderProjectsSelect();
  renderTasks();
  scheduleReminders();

  /* keep sortables responsive on resize (same as before) */
  $(window).on("resize", () => {
    try {
      $(".droppable").sortable("refresh");
      $("#backlogTable tbody").sortable("refresh");
    } catch (e) {}
  });
}); // end jQuery ready

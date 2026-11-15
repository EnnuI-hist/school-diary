/**
 * Дневник успеваемости (10 класс)
 * Чистый Vanilla JS без сторонних библиотек
 * Полное автосохранение настроек, расписания, посещаемости, оценок и сквозной статистики
 */

(function () {
  'use strict';

  // Константы ключей в localStorage
  const STORAGE_KEY = 'school_diary_10_settings_v1';
  const ACTIVE_TAB_KEY = 'school_diary_active_tab';
  const SYNC_STORAGE_KEY = 'school_diary_sync_id';
  const LAST_UPDATED_KEY = 'school_diary_last_updated';

  // Константы подключения к Supabase REST API
  const SUPABASE_URL = 'https://xqaqcjozsupvbkypits.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_5QoL5hjNIClH56TL1x74IQ_f9opvXGa';
  const SYNC_TABLE = 'diary_sync';

  // Текущая версия схемы конфигурации по умолчанию
  const CONFIG_VERSION = 2;

  // Дни недели для семестрового расписания (Понедельник - Суббота)
  const WEEK_DAYS = [
    { key: 'monday', name: 'Понедельник', shortName: 'Пн' },
    { key: 'tuesday', name: 'Вторник', shortName: 'Вт' },
    { key: 'wednesday', name: 'Среда', shortName: 'Ср' },
    { key: 'thursday', name: 'Четверг', shortName: 'Чт' },
    { key: 'friday', name: 'Пятница', shortName: 'Пт' },
    { key: 'saturday', name: 'Суббота', shortName: 'Сб' }
  ];

  // Русские названия месяцев в родительном падеже
  const RU_MONTHS_GENITIVE = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];

  // Базовые предметы по умолчанию (10 класс)
  const DEFAULT_SUBJECTS = [
    'Алгебра',
    'Биология',
    'Вероятность и статистика',
    'География',
    'Геометрия',
    'Иностранный язык',
    'Информатика',
    'История',
    'Классный час',
    'Литература',
    'ОБЗР',
    'Обществознание',
    'Право',
    'Проект',
    'Разговоры о важном',
    'Русский язык',
    'Физика',
    'Физкультура',
    'Химия',
    'Электив по русскому языку'
  ];

  // Начальное состояние приложения с предзаполненными семестрами, каникулами и шаблоном
  const DEFAULT_SETTINGS = {
    configVersion: CONFIG_VERSION,
    semesters: {
      sem1Start: '2026-09-01',
      sem1End: '2026-12-30',
      sem2Start: '2027-01-11',
      sem2End: '2027-05-28'
    },
    holidays: [
      {
        id: 'holiday-autumn',
        title: 'Осенние каникулы',
        start: '2026-10-26',
        end: '2026-11-04'
      },
      {
        id: 'holiday-winter',
        title: 'Зимние каникулы',
        start: '2026-12-31',
        end: '2027-01-10'
      },
      {
        id: 'holiday-spring',
        title: 'Весенние каникулы',
        start: '2027-03-27',
        end: '2027-04-04'
      }
    ],
    subjects: [...DEFAULT_SUBJECTS],
    schedule: {
      monday: [
        'ОБЗР',
        'Обществознание',
        'Алгебра',
        'История',
        'Проект',
        'Право',
        'Физика',
        'Разговоры о важном'
      ],
      tuesday: [
        'Иностранный язык',
        'Русский язык',
        'Литература',
        'Алгебра',
        'География',
        'Геометрия',
        'Обществознание'
      ],
      wednesday: [
        'Русский язык',
        'Физика',
        'Литература',
        'Биология',
        'Алгебра',
        'Литература',
        'Иностранный язык'
      ],
      thursday: [
        '',
        'Физкультура',
        'Обществознание',
        'Информатика',
        'История',
        'Алгебра',
        'Электив по русскому языку',
        'Классный час'
      ],
      friday: [
        'Иностранный язык',
        'Химия',
        'Обществознание',
        'Геометрия',
        'Физкультура',
        'Геометрия',
        'Вероятность и статистика'
      ],
      saturday: []
    },
    diaryRecords: {},
    dayNotes: {},
    absenceWarningThreshold: 50,
    minGradesForAttestation: 3,
    customHolidays: {},
    lastUpdated: new Date().toISOString()
  };

  // Рабочее состояние приложения
  let state = loadSettings();

  // Состояние навигации по дневнику: Понедельник текущей отображаемой недели
  let diaryCurrentMonday = getMonday(new Date());

  // Состояние фильтрации во вкладке «Статистика»
  let statsPeriod = getDefaultPeriod();
  let statsMode = 'current'; // 'current' (прошедшие уроки) или 'all' (план за весь период)

  // Глобальный переключатель вкладок
  let switchTab = null;

  /* ==========================================================================
     Инициализация приложения
     ========================================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initDiary();
    initStats();
    initSemesterDates();
    initAbsenceThresholdSetting();
    initMinGradesSetting();
    initHolidays();
    initSubjectsManager();
    initWeekSchedule();
    initBackupActions();
    initCloudSync();
  });

  /* ==========================================================================
     Хранилище (localStorage) и версионирование настроек
     ========================================================================== */
  function sanitizeLoadedState(parsed) {
    if (!parsed || typeof parsed !== 'object') {
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }

    const semesters = {
      sem1Start: parsed.semesters?.sem1Start || DEFAULT_SETTINGS.semesters.sem1Start,
      sem1End: parsed.semesters?.sem1End || DEFAULT_SETTINGS.semesters.sem1End,
      sem2Start: parsed.semesters?.sem2Start || DEFAULT_SETTINGS.semesters.sem2Start,
      sem2End: parsed.semesters?.sem2End || DEFAULT_SETTINGS.semesters.sem2End
    };

    const absenceWarningThreshold = (typeof parsed.absenceWarningThreshold === 'number' && !isNaN(parsed.absenceWarningThreshold))
      ? Math.max(10, Math.min(100, parsed.absenceWarningThreshold))
      : DEFAULT_SETTINGS.absenceWarningThreshold;

    const minGradesForAttestation = (typeof parsed.minGradesForAttestation === 'number' && !isNaN(parsed.minGradesForAttestation))
      ? Math.max(1, Math.min(20, Math.round(parsed.minGradesForAttestation)))
      : DEFAULT_SETTINGS.minGradesForAttestation;

    const lastUpdated = parsed.lastUpdated || localStorage.getItem(LAST_UPDATED_KEY) || new Date().toISOString();

    return {
      configVersion: parsed.configVersion || CONFIG_VERSION,
      semesters,
      holidays: Array.isArray(parsed.holidays) ? parsed.holidays : [...DEFAULT_SETTINGS.holidays],
      subjects: Array.isArray(parsed.subjects) && parsed.subjects.length > 0 ? parsed.subjects : [...DEFAULT_SETTINGS.subjects],
      schedule: sanitizeSchedule(parsed.schedule),
      diaryRecords: parsed.diaryRecords && typeof parsed.diaryRecords === 'object' ? parsed.diaryRecords : {},
      dayNotes: parsed.dayNotes && typeof parsed.dayNotes === 'object' ? parsed.dayNotes : {},
      absenceWarningThreshold,
      minGradesForAttestation,
      customHolidays: (parsed.customHolidays && typeof parsed.customHolidays === 'object') ? parsed.customHolidays : {},
      lastUpdated
    };
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const initial = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        initial.lastUpdated = new Date().toISOString();
        try {
          localStorage.setItem(LAST_UPDATED_KEY, initial.lastUpdated);
        } catch (_) {}
        return initial;
      }
      const parsed = JSON.parse(raw);
      
      // Миграция со старой версии (демо-данные версии 1):
      // Если configVersion < 2 или не задана, подтягиваем новое расписание, каникулы и предметы,
      // сохраняя уже выставленные оценки, историю в diaryRecords и заметки в dayNotes.
      if (!parsed.configVersion || parsed.configVersion < CONFIG_VERSION) {
        const upgraded = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        if (parsed.diaryRecords && typeof parsed.diaryRecords === 'object') {
          upgraded.diaryRecords = parsed.diaryRecords;
        }
        if (parsed.dayNotes && typeof parsed.dayNotes === 'object') {
          upgraded.dayNotes = parsed.dayNotes;
        }
        if (typeof parsed.absenceWarningThreshold === 'number' && !isNaN(parsed.absenceWarningThreshold)) {
          upgraded.absenceWarningThreshold = Math.max(10, Math.min(100, parsed.absenceWarningThreshold));
        }
        if (typeof parsed.minGradesForAttestation === 'number' && !isNaN(parsed.minGradesForAttestation)) {
          upgraded.minGradesForAttestation = Math.max(1, Math.min(20, Math.round(parsed.minGradesForAttestation)));
        }
        if (parsed.customHolidays && typeof parsed.customHolidays === 'object') {
          upgraded.customHolidays = parsed.customHolidays;
        }
        upgraded.lastUpdated = parsed.lastUpdated || localStorage.getItem(LAST_UPDATED_KEY) || new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(upgraded));
        localStorage.setItem(LAST_UPDATED_KEY, upgraded.lastUpdated);
        return upgraded;
      }

      const loaded = sanitizeLoadedState(parsed);
      if (!localStorage.getItem(LAST_UPDATED_KEY)) {
        try {
          localStorage.setItem(LAST_UPDATED_KEY, loaded.lastUpdated);
        } catch (_) {}
      }
      return loaded;
    } catch (e) {
      console.error('Ошибка чтения данных из localStorage:', e);
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
  }

  function saveSettings(showNotification = false) {
    try {
      const nowISO = new Date().toISOString();
      state.lastUpdated = nowISO;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem(LAST_UPDATED_KEY, nowISO);
      if (showNotification) {
        showToast('Настройки сохранены', 'success');
      }
      triggerCloudSyncDebounced();
    } catch (e) {
      console.error('Ошибка сохранения в localStorage:', e);
      showToast('Не удалось сохранить настройки в браузере', 'error');
    }
  }

  function sanitizeSchedule(loadedSchedule) {
    const validSchedule = {};
    WEEK_DAYS.forEach(day => {
      if (loadedSchedule && Array.isArray(loadedSchedule[day.key])) {
        validSchedule[day.key] = [...loadedSchedule[day.key]];
      } else if (DEFAULT_SETTINGS.schedule[day.key]) {
        validSchedule[day.key] = [...DEFAULT_SETTINGS.schedule[day.key]];
      } else {
        validSchedule[day.key] = [];
      }
    });
    return validSchedule;
  }

  function getDefaultPeriod() {
    const todayStr = toISODate(new Date());
    const { sem2Start, sem2End } = state.semesters;
    if (sem2Start && sem2End && todayStr >= sem2Start && todayStr <= sem2End) {
      return 'sem2';
    }
    return 'sem1';
  }

  /* ==========================================================================
     1. Вкладки (Навигация)
     ========================================================================== */
  function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    const savedTab = localStorage.getItem(ACTIVE_TAB_KEY) || 'diary';
    activateTab(savedTab);

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        activateTab(targetTab);
        localStorage.setItem(ACTIVE_TAB_KEY, targetTab);

        if (targetTab === 'diary') {
          renderDiaryWeek();
        } else if (targetTab === 'stats') {
          renderStats();
        }
      });
    });

    switchTab = function(tabId) {
      activateTab(tabId);
      localStorage.setItem(ACTIVE_TAB_KEY, tabId);
      if (tabId === 'diary') {
        renderDiaryWeek();
      } else if (tabId === 'stats') {
        renderStats();
      }
    };

    function activateTab(tabId) {
      tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
      });

      tabPanes.forEach(pane => {
        pane.classList.toggle('active', pane.id === `tab-${tabId}`);
      });

      if (tabId === 'stats') {
        renderStats();
      }
    }
  }

  /* ==========================================================================
     2. Вкладка «Дневник»: Логика учебного года и интерфейс недели
     ========================================================================== */
  function initDiary() {
    const prevBtn = document.getElementById('prev-week-btn');
    const todayBtn = document.getElementById('today-week-btn');
    const nextBtn = document.getElementById('next-week-btn');
    const jumpMonthSelect = document.getElementById('diary-jump-month');
    const jumpDateInput = document.getElementById('diary-jump-date');

    prevBtn.addEventListener('click', () => {
      diaryCurrentMonday = addDays(diaryCurrentMonday, -7);
      renderDiaryWeek();
    });

    todayBtn.addEventListener('click', () => {
      diaryCurrentMonday = getMonday(new Date());
      renderDiaryWeek();
      showToast('Переход к текущей неделе', 'info');
    });

    nextBtn.addEventListener('click', () => {
      diaryCurrentMonday = addDays(diaryCurrentMonday, 7);
      renderDiaryWeek();
    });

    jumpMonthSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (!val) return;

      if (val === 'sem1') {
        const d = parseISODate(state.semesters.sem1Start || '2026-09-01');
        diaryCurrentMonday = getMonday(d);
      } else if (val === 'sem2') {
        const d = parseISODate(state.semesters.sem2Start || '2027-01-11');
        diaryCurrentMonday = getMonday(d);
      } else {
        const d = parseISODate(val);
        diaryCurrentMonday = getMonday(d);
      }

      renderDiaryWeek();
      jumpMonthSelect.value = '';
    });

    jumpDateInput.addEventListener('change', (e) => {
      if (e.target.value) {
        const selected = parseISODate(e.target.value);
        diaryCurrentMonday = getMonday(selected);
        renderDiaryWeek();
      }
    });

    renderDiaryWeek();
  }

  function getDayStatus(dateStr) {
    if (Array.isArray(state.holidays)) {
      const holiday = state.holidays.find(h => h.start <= dateStr && dateStr <= h.end);
      if (holiday) {
        return {
          isSchoolDay: false,
          isHoliday: true,
          isCustomHoliday: false,
          title: holiday.title
        };
      }
    }

    if (state.customHolidays && state.customHolidays[dateStr]) {
      const customTitle = typeof state.customHolidays[dateStr] === 'string'
        ? state.customHolidays[dateStr]
        : 'Выходной / Праздник';
      return {
        isSchoolDay: false,
        isHoliday: true,
        isCustomHoliday: true,
        title: customTitle
      };
    }

    const { sem1Start, sem1End, sem2Start, sem2End } = state.semesters;
    const isSem1 = sem1Start && sem1End && dateStr >= sem1Start && dateStr <= sem1End;
    const isSem2 = sem2Start && sem2End && dateStr >= sem2Start && dateStr <= sem2End;

    if (isSem1) {
      return { isSchoolDay: true, semester: 1 };
    }
    if (isSem2) {
      return { isSchoolDay: true, semester: 2 };
    }

    return {
      isSchoolDay: false,
      isOutsideSemester: true,
      title: 'Неучебный период'
    };
  }

  function renderDiaryWeek() {
    const weekDisplay = document.getElementById('current-week-display');
    const weekSubBadge = document.getElementById('current-week-sub');
    const weekStatusBadge = document.getElementById('current-week-status');
    const weekGrid = document.getElementById('diary-week-grid');

    if (!weekDisplay || !weekGrid) return;

    const saturday = addDays(diaryCurrentMonday, 5);
    weekDisplay.textContent = formatDateRussianRange(diaryCurrentMonday, saturday);

    const monStr = toISODate(diaryCurrentMonday);
    const friStr = toISODate(addDays(diaryCurrentMonday, 4));
    const monStatus = getDayStatus(monStr);
    const friStatus = getDayStatus(friStr);

    if (monStatus.semester === 1 || friStatus.semester === 1) {
      weekSubBadge.textContent = '1-й семестр';
      weekSubBadge.style.display = 'inline-block';
    } else if (monStatus.semester === 2 || friStatus.semester === 2) {
      weekSubBadge.textContent = '2-й семестр';
      weekSubBadge.style.display = 'inline-block';
    } else {
      weekSubBadge.textContent = 'Вне семестров';
      weekSubBadge.style.display = 'inline-block';
    }

    const isWeekVacation = (monStatus.isHoliday && !monStatus.isCustomHoliday) || (friStatus.isHoliday && !friStatus.isCustomHoliday);
    if (isWeekVacation) {
      const holName = (!monStatus.isCustomHoliday ? monStatus.title : '') || (!friStatus.isCustomHoliday ? friStatus.title : '') || 'Каникулы';
      weekStatusBadge.textContent = holName;
      weekStatusBadge.className = 'week-status-badge badge-holiday-tag';
      weekStatusBadge.style.display = 'inline-block';
    } else {
      weekStatusBadge.style.display = 'none';
    }

    weekGrid.innerHTML = '';
    const todayStr = toISODate(new Date());

    WEEK_DAYS.forEach((dayInfo, dayIndex) => {
      const dayDate = addDays(diaryCurrentMonday, dayIndex);
      const dateStr = toISODate(dayDate);
      const dayStatus = getDayStatus(dateStr);
      const isToday = dateStr === todayStr;

      const card = createDiaryDayCard(dayInfo, dayDate, dateStr, dayStatus, isToday);
      weekGrid.appendChild(card);
    });
  }

  function createDiaryDayCard(dayInfo, dayDate, dateStr, dayStatus, isToday) {
    const card = document.createElement('div');
    card.className = 'diary-day-card';
    card.id = `diary-day-${dateStr}`;

    if (isToday) {
      card.classList.add('is-today');
    }

    if (!dayStatus.isSchoolDay) {
      if (dayStatus.isHoliday || dayStatus.isCustomHoliday) {
        card.classList.add('is-holiday');
      } else {
        card.classList.add('is-non-school');
      }
    }

    const templateLessons = state.schedule[dayInfo.key] || [];
    const savedDayRecords = state.diaryRecords[dateStr] || {};
    const activeTemplateLessons = templateLessons.filter(s => s && s.trim().length > 0);
    const hasActiveLessons = activeTemplateLessons.length > 0;

    const formattedShortDate = formatDateShortRussian(dayDate);
    let statusBadgeHtml = '';
    if (dayStatus.isCustomHoliday) {
      statusBadgeHtml = `<span class="badge-holiday-tag" title="Выходной / Праздник">Выходной / Праздник</span>`;
    } else if (dayStatus.isHoliday) {
      statusBadgeHtml = `<span class="badge-holiday-tag" title="Каникулы">Каникулы: ${escapeHtml(dayStatus.title)}</span>`;
    } else if (dayStatus.isOutsideSemester) {
      statusBadgeHtml = `<span class="badge-off-tag">Неучебный день</span>`;
    } else if (!hasActiveLessons) {
      statusBadgeHtml = `<span class="badge-off-tag">Выходной</span>`;
    }

    const todayBadgeHtml = isToday ? `<span class="badge-today">Сегодня</span>` : '';

    // Кнопки массовых действий в шапке дня отображаются только при наличии уроков
    const bulkActionsHtml = hasActiveLessons ? `
      <div class="day-bulk-actions">
        <button type="button" class="btn-bulk btn-bulk-unexcused" data-date="${dateStr}" data-day="${dayInfo.key}" title="Поставить «Н» (прогул) на все уроки дня">
          Н на весь день
        </button>
        <button type="button" class="btn-bulk btn-bulk-excused" data-date="${dateStr}" data-day="${dayInfo.key}" title="Поставить «У» (уважительная причина) на все уроки дня">
          У на весь день
        </button>
        <button type="button" class="btn-bulk btn-bulk-reset" data-date="${dateStr}" data-day="${dayInfo.key}" title="Сбросить статус всех уроков дня на «Был»">
          Сброс (Был)
        </button>
      </div>
    ` : '';

    const hasNote = Boolean(state.dayNotes && state.dayNotes[dateStr] && state.dayNotes[dateStr].trim());
    const isCustom = Boolean(dayStatus.isCustomHoliday);

    let actionsRowHtml = '';
    if (isCustom) {
      actionsRowHtml = `
        <div class="day-actions-row">
          <button type="button" class="btn-bulk btn-bulk-restore" data-date="${dateStr}" id="btn-holiday-toggle-${dateStr}" title="Вернуть учебный день и сетку уроков">
            <span>↩️</span> Вернуть учебный день
          </button>
          <div class="day-right-actions">
            <button type="button" class="btn-bulk btn-bulk-note ${hasNote ? 'has-note' : ''}" data-date="${dateStr}" id="btn-note-toggle-${dateStr}" title="${hasNote ? 'Редактировать заметку на день' : 'Добавить заметку на день'}">
              <span>📝</span>
              <span class="btn-note-text">${hasNote ? 'Заметка' : '+ Заметка'}</span>
            </button>
          </div>
        </div>
      `;
    } else if (dayStatus.isSchoolDay) {
      actionsRowHtml = `
        <div class="day-actions-row">
          ${bulkActionsHtml}
          <div class="day-right-actions">
            <button type="button" class="btn-bulk btn-bulk-holiday" data-date="${dateStr}" id="btn-holiday-toggle-${dateStr}" title="Пометить день как разовый выходной / праздник / день олимпиады">
              <span>🏖</span> Выходной
            </button>
            <button type="button" class="btn-bulk btn-bulk-note ${hasNote ? 'has-note' : ''}" data-date="${dateStr}" id="btn-note-toggle-${dateStr}" title="${hasNote ? 'Редактировать заметку на день' : 'Добавить заметку на день'}">
              <span>📝</span>
              <span class="btn-note-text">${hasNote ? 'Заметка' : '+ Заметка'}</span>
            </button>
          </div>
        </div>
      `;
    } else {
      actionsRowHtml = `
        <div class="day-actions-row">
          <div class="day-right-actions" style="margin-left: auto;">
            <button type="button" class="btn-bulk btn-bulk-note ${hasNote ? 'has-note' : ''}" data-date="${dateStr}" id="btn-note-toggle-${dateStr}" title="${hasNote ? 'Редактировать заметку на день' : 'Добавить заметку на день'}">
              <span>📝</span>
              <span class="btn-note-text">${hasNote ? 'Заметка' : '+ Заметка'}</span>
            </button>
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="diary-day-header">
        <div class="day-header-top">
          <div class="day-title-box">
            <span class="day-title-text">${dayInfo.name}</span>
            <span class="day-date-text">${formattedShortDate}</span>
            ${todayBadgeHtml}
          </div>
          ${statusBadgeHtml}
        </div>
        ${actionsRowHtml}
      </div>
      <div class="diary-day-body" id="day-body-${dateStr}">
      </div>
    `;

    if (hasActiveLessons && !isCustom) {
      const btnUnexcused = card.querySelector('.btn-bulk-unexcused');
      const btnExcused = card.querySelector('.btn-bulk-excused');
      const btnReset = card.querySelector('.btn-bulk-reset');

      if (btnUnexcused) btnUnexcused.addEventListener('click', () => setDayBulkAttendance(dateStr, dayInfo.key, 'unexcused'));
      if (btnExcused) btnExcused.addEventListener('click', () => setDayBulkAttendance(dateStr, dayInfo.key, 'excused'));
      if (btnReset) btnReset.addEventListener('click', () => setDayBulkAttendance(dateStr, dayInfo.key, 'was'));
    }

    const btnHolidayToggle = card.querySelector(`#btn-holiday-toggle-${dateStr}`);
    if (btnHolidayToggle) {
      btnHolidayToggle.addEventListener('click', () => toggleCustomHoliday(dateStr));
    }

    const btnNoteToggle = card.querySelector(`#btn-note-toggle-${dateStr}`);
    if (btnNoteToggle) {
      btnNoteToggle.addEventListener('click', () => toggleDayNote(dateStr));
    }

    const bodyContainer = card.querySelector(`#day-body-${dateStr}`);

    // Блок заметки на день (размещается вверху карточки дня)
    const noteContainer = document.createElement('div');
    noteContainer.className = 'day-note-container';
    noteContainer.id = `day-note-container-${dateStr}`;
    bodyContainer.appendChild(noteContainer);
    renderDayNoteSection(dateStr, noteContainer);

    if (dayStatus.isCustomHoliday) {
      const notice = document.createElement('div');
      notice.className = 'holiday-notice custom-holiday-notice';
      notice.innerHTML = `
        <span class="custom-holiday-icon">🏖</span>
        <div class="custom-holiday-desc">
          <strong>Выходной / Праздник</strong>
          <span>Занятия отменены и исключены из расчета уроков и прогулов.</span>
        </div>
      `;
      bodyContainer.appendChild(notice);
      return card;
    } else if (dayStatus.isHoliday) {
      const notice = document.createElement('div');
      notice.className = 'holiday-notice';
      notice.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="holiday-notice-icon">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
        <span>Каникулярный период: <strong>${escapeHtml(dayStatus.title)}</strong>. Занятия не проводятся.</span>
      `;
      bodyContainer.appendChild(notice);
      return card;
    } else if (dayStatus.isOutsideSemester) {
      const notice = document.createElement('div');
      notice.className = 'holiday-notice';
      notice.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="holiday-notice-icon">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <span>Дата вне рамок учебных семестров.</span>
      `;
      bodyContainer.appendChild(notice);
      return card;
    }

    // Если нет уроков по расписанию (например, в субботу при пятидневке)
    if (!hasActiveLessons && dayStatus.isSchoolDay) {
      const emptyNotice = document.createElement('div');
      emptyNotice.className = 'empty-state';
      emptyNotice.style.padding = '16px';
      emptyNotice.style.fontSize = '0.88rem';
      emptyNotice.textContent = dayInfo.key === 'saturday' ? 'Выходной день (уроков нет)' : 'Нет запланированных уроков в расписании недели';
      bodyContainer.appendChild(emptyNotice);
      return card;
    }

    const maxIdx = Math.max(
      templateLessons.length,
      ...Object.keys(savedDayRecords).map(k => Number(k) + 1)
    );

    const lessonsList = document.createElement('div');
    lessonsList.className = 'diary-lessons-list';

    // Подсказка, если 1-й урок отсутствует (приход ко 2-му уроку, как в четверг)
    if (templateLessons[0] === '' && hasActiveLessons) {
      const windowHint = document.createElement('div');
      windowHint.className = 'diary-window-hint';
      windowHint.textContent = '1-й урок отсутствует (приход ко 2-му уроку)';
      lessonsList.appendChild(windowHint);
    }

    for (let i = 0; i < maxIdx; i++) {
      const templateSubj = templateLessons[i] || '';
      const lessonRecord = savedDayRecords[i] || {
        attendance: 'was',
        marks: [],
        subject: templateSubj
      };

      const subjectName = templateSubj || lessonRecord.subject || '';

      // Если в шаблоне урок пуст (окно) и нет выставленных оценок/пропусков, не создаем лишнюю строку
      if (!subjectName && (!lessonRecord.marks || lessonRecord.marks.length === 0) && lessonRecord.attendance === 'was') {
        continue;
      }

      const lessonRow = createDiaryLessonRow(dateStr, i, subjectName, lessonRecord);
      lessonsList.appendChild(lessonRow);
    }

    bodyContainer.appendChild(lessonsList);
    return card;
  }

  function createDiaryLessonRow(dateStr, lessonIndex, subjectName, lessonRecord) {
    const row = document.createElement('div');
    row.className = 'diary-lesson-item';
    row.id = `lesson-row-${dateStr}-${lessonIndex}`;

    const currentAttendance = lessonRecord.attendance || 'was';
    if (currentAttendance === 'unexcused') {
      row.classList.add('att-unexcused');
    } else if (currentAttendance === 'excused') {
      row.classList.add('att-excused');
    }

    const displaySubject = subjectName
      ? `<span class="lesson-subject-name" title="${escapeHtml(subjectName)}">${escapeHtml(subjectName)}</span>`
      : `<span class="lesson-subject-name lesson-empty-placeholder">— Окно / Нет урока —</span>`;

    row.innerHTML = `
      <div class="lesson-top-row">
        <div class="lesson-info">
          <span class="lesson-number-circle">${lessonIndex + 1}</span>
          ${displaySubject}
        </div>
        
        <div class="attendance-segmented" role="group" aria-label="Посещаемость урока">
          <button type="button" class="att-btn att-was ${currentAttendance === 'was' ? 'active' : ''}" data-status="was" title="Присутствовал на уроке">
            Был
          </button>
          <button type="button" class="att-btn att-unexcused ${currentAttendance === 'unexcused' ? 'active' : ''}" data-status="unexcused" title="Неуважительный прогул (Н)">
            Н
          </button>
          <button type="button" class="att-btn att-excused ${currentAttendance === 'excused' ? 'active' : ''}" data-status="excused" title="Уважительная причина (У)">
            У
          </button>
        </div>
      </div>

      <div class="lesson-bottom-row">
        <div class="marks-container" id="marks-container-${dateStr}-${lessonIndex}">
        </div>

        <div class="quick-marks-picker">
          <span class="picker-label">+ Оценка:</span>
          <button type="button" class="btn-add-mark btn-add-mark-5" data-grade="5" title="Поставить оценку 5">5</button>
          <button type="button" class="btn-add-mark btn-add-mark-4" data-grade="4" title="Поставить оценку 4">4</button>
          <button type="button" class="btn-add-mark btn-add-mark-3" data-grade="3" title="Поставить оценку 3">3</button>
          <button type="button" class="btn-add-mark btn-add-mark-2" data-grade="2" title="Поставить оценку 2">2</button>
        </div>
      </div>
    `;

    const attButtons = row.querySelectorAll('.att-btn');
    attButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const status = btn.getAttribute('data-status');
        setLessonAttendance(dateStr, lessonIndex, subjectName, status, row);
      });
    });

    const markButtons = row.querySelectorAll('.btn-add-mark');
    markButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const grade = Number(btn.getAttribute('data-grade'));
        addMarkToLesson(dateStr, lessonIndex, subjectName, grade);
      });
    });

    renderLessonMarks(dateStr, lessonIndex, row.querySelector(`#marks-container-${dateStr}-${lessonIndex}`));
    return row;
  }

  function renderLessonMarks(dateStr, lessonIndex, container) {
    if (!container) {
      container = document.getElementById(`marks-container-${dateStr}-${lessonIndex}`);
    }
    if (!container) return;

    container.innerHTML = '';
    const record = state.diaryRecords[dateStr]?.[lessonIndex];
    const marks = record?.marks || [];

    if (marks.length === 0) {
      const placeholder = document.createElement('span');
      placeholder.style.fontSize = '0.78rem';
      placeholder.style.color = 'var(--text-muted)';
      placeholder.textContent = 'Нет оценок';
      container.appendChild(placeholder);
      return;
    }

    marks.forEach((mark, markIdx) => {
      const badge = document.createElement('span');
      badge.className = `mark-badge mark-badge-${mark}`;
      badge.title = `Кликните, чтобы удалить оценку ${mark}`;
      badge.innerHTML = `${mark} <span class="mark-del-x">&times;</span>`;

      badge.addEventListener('click', () => {
        removeMarkFromLesson(dateStr, lessonIndex, markIdx);
      });

      container.appendChild(badge);
    });
  }

  function setLessonAttendance(dateStr, lessonIndex, subjectName, status, rowEl) {
    state.diaryRecords[dateStr] = state.diaryRecords[dateStr] || {};
    if (!state.diaryRecords[dateStr][lessonIndex]) {
      state.diaryRecords[dateStr][lessonIndex] = {
        attendance: 'was',
        marks: [],
        subject: subjectName || ''
      };
    }

    state.diaryRecords[dateStr][lessonIndex].attendance = status;
    if (subjectName) {
      state.diaryRecords[dateStr][lessonIndex].subject = subjectName;
    }

    saveSettings();

    if (rowEl) {
      rowEl.classList.remove('att-unexcused', 'att-excused');
      if (status === 'unexcused') {
        rowEl.classList.add('att-unexcused');
      } else if (status === 'excused') {
        rowEl.classList.add('att-excused');
      }

      const buttons = rowEl.querySelectorAll('.att-btn');
      buttons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-status') === status);
      });
    }
  }

  function addMarkToLesson(dateStr, lessonIndex, subjectName, grade) {
    state.diaryRecords[dateStr] = state.diaryRecords[dateStr] || {};
    if (!state.diaryRecords[dateStr][lessonIndex]) {
      state.diaryRecords[dateStr][lessonIndex] = {
        attendance: 'was',
        marks: [],
        subject: subjectName || ''
      };
    }

    state.diaryRecords[dateStr][lessonIndex].marks.push(grade);
    if (subjectName) {
      state.diaryRecords[dateStr][lessonIndex].subject = subjectName;
    }

    saveSettings();
    renderLessonMarks(dateStr, lessonIndex);
    showToast(`Оценка ${grade} выставлена (${subjectName || 'Урок ' + (lessonIndex + 1)})`, 'success');
  }

  function removeMarkFromLesson(dateStr, lessonIndex, markIdx) {
    const record = state.diaryRecords[dateStr]?.[lessonIndex];
    if (record && Array.isArray(record.marks) && record.marks.length > markIdx) {
      const removed = record.marks.splice(markIdx, 1);
      saveSettings();
      renderLessonMarks(dateStr, lessonIndex);
      showToast(`Оценка ${removed[0]} удалена`, 'info');
    }
  }

  function setDayBulkAttendance(dateStr, dayKey, status) {
    const templateLessons = state.schedule[dayKey] || [];
    const activeLessons = templateLessons.filter(s => s && s.trim().length > 0);
    if (activeLessons.length === 0) {
      showToast('В расписании на этот день нет уроков', 'info');
      return;
    }

    state.diaryRecords[dateStr] = state.diaryRecords[dateStr] || {};

    templateLessons.forEach((subj, idx) => {
      // Пропускаем пустые уроки (окна, например 1-й урок в четверг)
      if (!subj || !subj.trim()) return;

      state.diaryRecords[dateStr][idx] = state.diaryRecords[dateStr][idx] || {
        attendance: 'was',
        marks: [],
        subject: subj || ''
      };

      state.diaryRecords[dateStr][idx].attendance = status;
      state.diaryRecords[dateStr][idx].subject = subj;
    });

    saveSettings();
    renderDiaryWeek();
    renderStats();

    const dayObj = WEEK_DAYS.find(d => d.key === dayKey);
    const dayName = dayObj ? dayObj.name : 'День';
    const statusText = status === 'unexcused'
      ? 'прогул (Н) на все уроки дня'
      : (status === 'excused' ? 'уважительная причина (У) на все уроки дня' : '«Был» для всех уроков');

    showToast(`${dayName}: установлен статус ${statusText}`, 'success');
  }

  /* ==========================================================================
     Разовые выходные и праздники (Custom Holidays)
     ========================================================================== */
  function toggleCustomHoliday(dateStr) {
    state.customHolidays = state.customHolidays || {};
    if (state.customHolidays[dateStr]) {
      delete state.customHolidays[dateStr];
      saveSettings();
      renderDiaryWeek();
      renderStats();
      showToast('Учебный день возвращен', 'info');
    } else {
      state.customHolidays[dateStr] = 'Выходной / Праздник';
      saveSettings();
      renderDiaryWeek();
      renderStats();
      showToast('День отмечен как выходной / праздник', 'success');
    }
  }

  /* ==========================================================================
     Заметки на день (Day Notes)
     ========================================================================== */
  function updateNoteButtonState(dateStr) {
    const btn = document.getElementById(`btn-note-toggle-${dateStr}`);
    if (!btn) return;
    const hasNote = Boolean(state.dayNotes && state.dayNotes[dateStr] && state.dayNotes[dateStr].trim());
    const textSpan = btn.querySelector('.btn-note-text');
    if (hasNote) {
      btn.classList.add('has-note');
      btn.title = 'Редактировать заметку на день';
      if (textSpan) textSpan.textContent = 'Заметка';
    } else {
      btn.classList.remove('has-note');
      btn.title = 'Добавить заметку на день';
      if (textSpan) textSpan.textContent = '+ Заметка';
    }
  }

  function toggleDayNote(dateStr) {
    const container = document.getElementById(`day-note-container-${dateStr}`);
    if (!container) return;

    // Проверяем, открыт ли уже режим редактирования
    const isEditing = Boolean(container.querySelector('.day-note-edit'));
    if (isEditing) {
      renderDayNoteSection(dateStr, container, false);
    } else {
      renderDayNoteSection(dateStr, container, true);
    }
  }

  function renderDayNoteSection(dateStr, container, isEditing = false) {
    if (!container) return;
    state.dayNotes = state.dayNotes || {};
    const noteText = (state.dayNotes[dateStr] || '').trim();

    container.innerHTML = '';

    if (isEditing) {
      const editBox = document.createElement('div');
      editBox.className = 'day-note-edit';
      editBox.innerHTML = `
        <textarea class="day-note-textarea" placeholder="Заметка на день (например: сдать справку, домашнее задание, напоминания)..." rows="2"></textarea>
        <div class="day-note-edit-footer">
          <span class="day-note-hint">Enter — новая строка. Автосохранение</span>
          <button type="button" class="btn-note-done">Готово</button>
        </div>
      `;

      const textarea = editBox.querySelector('.day-note-textarea');
      const btnDone = editBox.querySelector('.btn-note-done');

      textarea.value = state.dayNotes[dateStr] || '';

      const autoResize = () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(52, textarea.scrollHeight) + 'px';
      };

      const saveNoteContent = () => {
        const val = textarea.value;
        if (val.trim()) {
          state.dayNotes[dateStr] = val;
        } else {
          delete state.dayNotes[dateStr];
        }
        saveSettings();
        updateNoteButtonState(dateStr);
      };

      textarea.addEventListener('input', () => {
        autoResize();
        saveNoteContent();
      });

      textarea.addEventListener('blur', () => {
        saveNoteContent();
      });

      btnDone.addEventListener('click', (e) => {
        e.stopPropagation();
        saveNoteContent();
        renderDayNoteSection(dateStr, container, false);
      });

      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          saveNoteContent();
          renderDayNoteSection(dateStr, container, false);
        }
      });

      container.appendChild(editBox);
      autoResize();
      setTimeout(() => textarea.focus(), 10);
      return;
    }

    // Режим просмотра (если есть текст заметки)
    if (noteText) {
      const viewBox = document.createElement('div');
      viewBox.className = 'day-note-view';
      viewBox.title = 'Нажмите, чтобы редактировать заметку';
      viewBox.innerHTML = `
        <div class="day-note-header">
          <span class="day-note-badge">
            <span>📝</span> Заметка
          </span>
          <button type="button" class="day-note-btn-del" title="Удалить заметку">×</button>
        </div>
        <div class="day-note-content">${escapeHtml(state.dayNotes[dateStr] || '')}</div>
      `;

      // Клик по тексту заметки переключает в режим редактирования
      viewBox.addEventListener('click', (e) => {
        if (e.target.closest('.day-note-btn-del')) return;
        renderDayNoteSection(dateStr, container, true);
      });

      // Кнопка удаления заметки
      const delBtn = viewBox.querySelector('.day-note-btn-del');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Удалить заметку на этот день?')) {
          delete state.dayNotes[dateStr];
          saveSettings();
          renderDayNoteSection(dateStr, container, false);
          updateNoteButtonState(dateStr);
          showToast('Заметка удалена', 'info');
        }
      });

      container.appendChild(viewBox);
    }
  }

  /* ==========================================================================
     3. Вкладка «Статистика»: Дашборд, аналитика успеваемости и прогулов
     ========================================================================== */
  function initStats() {
    const periodButtons = document.querySelectorAll('#stats-period-selector .segment-btn');
    const modeButtons = document.querySelectorAll('#stats-mode-selector .segment-btn');

    periodButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-period') === statsPeriod);
      btn.addEventListener('click', () => {
        statsPeriod = btn.getAttribute('data-period');
        periodButtons.forEach(b => b.classList.toggle('active', b === btn));
        renderStats();
      });
    });

    modeButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === statsMode);
      btn.addEventListener('click', () => {
        statsMode = btn.getAttribute('data-mode');
        modeButtons.forEach(b => b.classList.toggle('active', b === btn));
        renderStats();
      });
    });
  }

  function calculateStatsData(period, mode) {
    let startStr = state.semesters.sem1Start || '2026-09-01';
    let endStr = state.semesters.sem1End || '2026-12-30';
    let periodName = '1-й семестр';

    if (period === 'sem2') {
      startStr = state.semesters.sem2Start || '2027-01-11';
      endStr = state.semesters.sem2End || '2027-05-28';
      periodName = '2-й семестр';
    } else if (period === 'year') {
      startStr = state.semesters.sem1Start || '2026-09-01';
      endStr = state.semesters.sem2End || '2027-05-28';
      periodName = 'Весь учебный год';
    }

    const todayStr = toISODate(new Date());
    const startDate = parseISODate(startStr);
    const endDate = parseISODate(endStr);

    let totalLessonsCount = 0;
    let totalPlanLessonsCount = 0;
    let totalPassedLessonsCount = 0;
    let totalUnexcused = 0;
    let totalExcused = 0;
    let fullTruancyDays = 0;
    let fullAbsenceDays = 0;

    const subjectsMap = {};
    state.subjects.forEach(subj => {
      subjectsMap[subj] = {
        name: subj,
        totalLessons: 0,
        totalPlanned: 0,
        passedLessons: 0,
        unexcused: 0,
        excused: 0,
        marks: []
      };
    });

    let curr = new Date(startDate);
    while (curr <= endDate) {
      const dateStr = toISODate(curr);
      const dayNum = curr.getDay(); // 0 - Вс

      if (dayNum !== 0) {
        const isOfficialHoliday = Array.isArray(state.holidays) && state.holidays.some(h => h.start <= dateStr && dateStr <= h.end);
        const isCustomHoliday = Boolean(state.customHolidays && state.customHolidays[dateStr]);
        const isHoliday = isOfficialHoliday || isCustomHoliday;
        
        let inSemester = true;
        if (period === 'year') {
          const inSem1 = state.semesters.sem1Start && state.semesters.sem1End && dateStr >= state.semesters.sem1Start && dateStr <= state.semesters.sem1End;
          const inSem2 = state.semesters.sem2Start && state.semesters.sem2End && dateStr >= state.semesters.sem2Start && dateStr <= state.semesters.sem2End;
          inSemester = inSem1 || inSem2;
        }

        if (!isHoliday && inSemester) {
          const dayKey = WEEK_DAYS[dayNum - 1].key;
          const templateLessons = state.schedule[dayKey] || [];
          const savedDayRecords = state.diaryRecords[dateStr] || {};

          const isPassed = dateStr <= todayStr;
          const isIncluded = mode === 'all' ? true : isPassed;

          let dayScheduledCount = 0;
          let dayUnexcusedCount = 0;
          let dayExcusedCount = 0;

          templateLessons.forEach((subj, idx) => {
            if (!subj || !subj.trim()) return;
            dayScheduledCount++;
            totalPlanLessonsCount++;
            if (isPassed) {
              totalPassedLessonsCount++;
            }

            if (isIncluded) {
              totalLessonsCount++;
            }

            if (!subjectsMap[subj]) {
              subjectsMap[subj] = {
                name: subj,
                totalLessons: 0,
                totalPlanned: 0,
                passedLessons: 0,
                unexcused: 0,
                excused: 0,
                marks: []
              };
            }

            subjectsMap[subj].totalPlanned++;
            if (isPassed) {
              subjectsMap[subj].passedLessons++;
            }

            if (isIncluded) {
              subjectsMap[subj].totalLessons++;
            }

            const record = savedDayRecords[idx];
            if (record) {
              if (record.attendance === 'unexcused') {
                if (isIncluded) {
                  totalUnexcused++;
                  subjectsMap[subj].unexcused++;
                }
                dayUnexcusedCount++;
              } else if (record.attendance === 'excused') {
                if (isIncluded) {
                  totalExcused++;
                  subjectsMap[subj].excused++;
                }
                dayExcusedCount++;
              }
            }
          });

          if (isIncluded && dayScheduledCount > 0 && dayUnexcusedCount === dayScheduledCount) {
            fullTruancyDays++;
          }
          if (isIncluded && dayScheduledCount > 0 && (dayUnexcusedCount + dayExcusedCount) === dayScheduledCount) {
            fullAbsenceDays++;
          }
        }
      }

      // Собираем оценки за эту дату, если она в рамках периода
      const inSem = (period === 'sem1' && dateStr >= (state.semesters.sem1Start || '') && dateStr <= (state.semesters.sem1End || ''))
        || (period === 'sem2' && dateStr >= (state.semesters.sem2Start || '') && dateStr <= (state.semesters.sem2End || ''))
        || (period === 'year');

      if (inSem && state.diaryRecords[dateStr]) {
        const dayKey = dayNum > 0 ? WEEK_DAYS[dayNum - 1]?.key : null;
        const template = dayKey ? state.schedule[dayKey] || [] : [];

        Object.keys(state.diaryRecords[dateStr]).forEach(slotIdx => {
          const rec = state.diaryRecords[dateStr][slotIdx];
          if (rec && Array.isArray(rec.marks) && rec.marks.length > 0) {
            const subjName = rec.subject || template[slotIdx];
            if (subjName && subjectsMap[subjName]) {
              subjectsMap[subjName].marks.push(...rec.marks);
            }
          }
        });
      }

      curr.setDate(curr.getDate() + 1);
    }

    return {
      periodName,
      startStr,
      endStr,
      totalLessonsCount,
      totalPlanLessonsCount,
      totalPassedLessonsCount,
      totalUnexcused,
      totalExcused,
      totalAbsence: totalUnexcused + totalExcused,
      fullTruancyDays,
      fullAbsenceDays,
      subjectsMap
    };
  }

  function renderStats() {
    const stats = calculateStatsData(statsPeriod, statsMode);

    // 1. Информационная строка периода
    const periodInfoEl = document.getElementById('stats-period-info');
    if (periodInfoEl) {
      const modeText = statsMode === 'current'
        ? `Пройдено уроков: <strong>${stats.totalPassedLessonsCount}</strong> из ${stats.totalPlanLessonsCount} запланированных`
        : `Всего уроков в плане: <strong>${stats.totalPlanLessonsCount}</strong>`;

      periodInfoEl.innerHTML = `
        <span class="stats-period-dates">Период: ${formatDate(stats.startStr)} — ${formatDate(stats.endStr)} (${stats.periodName})</span>
        <span class="stats-period-progress">${modeText}</span>
      `;
    }

    // 2. Верхний дашборд: 4 карточки сводки
    const totalLessonsEl = document.getElementById('summary-total-lessons');
    const totalSubEl = document.getElementById('summary-total-sub');
    const unexcusedCountEl = document.getElementById('summary-unexcused-count');
    const unexcusedPercentEl = document.getElementById('summary-unexcused-percent');
    const excusedCountEl = document.getElementById('summary-excused-count');
    const excusedPercentEl = document.getElementById('summary-excused-percent');
    const totalAbsenceEl = document.getElementById('summary-total-absence');
    const totalAbsenceSubEl = document.getElementById('summary-total-absence-sub');

    const total = stats.totalLessonsCount;
    const unexcusedPct = total > 0 ? (stats.totalUnexcused / total) * 100 : 0;
    const excusedPct = total > 0 ? (stats.totalExcused / total) * 100 : 0;
    const totalAbsencePct = total > 0 ? (stats.totalAbsence / total) * 100 : 0;

    if (totalLessonsEl) totalLessonsEl.textContent = total;
    if (totalSubEl) {
      totalSubEl.textContent = statsMode === 'current' ? 'Прошедших до сегодня' : 'По плану периода';
    }

    if (unexcusedCountEl) unexcusedCountEl.textContent = stats.totalUnexcused;
    if (unexcusedPercentEl) {
      unexcusedPercentEl.textContent = `${unexcusedPct.toFixed(1)}% от уроков`;
    }

    if (excusedCountEl) excusedCountEl.textContent = stats.totalExcused;
    if (excusedPercentEl) {
      excusedPercentEl.textContent = `${excusedPct.toFixed(1)}% от уроков`;
    }

    if (totalAbsenceEl) totalAbsenceEl.textContent = stats.totalAbsence;
    if (totalAbsenceSubEl) {
      totalAbsenceSubEl.textContent = `${totalAbsencePct.toFixed(1)}% • Прогулянных дней (Н): ${stats.fullTruancyDays}`;
    }

    // 3. Карточки по каждому предмету
    renderSubjectsStats(stats.subjectsMap, statsMode);
  }

  function renderSubjectsStats(subjectsMap, mode = 'current') {
    const container = document.getElementById('stats-subjects-container');
    if (!container) return;

    container.innerHTML = '';

    const subjectNames = Object.keys(subjectsMap);
    if (subjectNames.length === 0) {
      container.innerHTML = `<div class="empty-state">Нет школьных предметов в списке настроек</div>`;
      return;
    }

    subjectNames.forEach(name => {
      const item = subjectsMap[name];
      const card = createSubjectStatCard(item, mode);
      container.appendChild(card);
    });
  }

  function createSubjectStatCard(item, mode = 'current') {
    const card = document.createElement('div');
    card.className = 'subject-stat-card';

    // Расчет успеваемости
    const marks = item.marks || [];
    let avg = null;
    if (marks.length > 0) {
      const sum = marks.reduce((a, b) => a + b, 0);
      avg = sum / marks.length;
    }

    const projected = getProjectedGrade(avg);
    const goal = calculateSmartGoal(marks);

    // Расчет посещаемости
    const lessons = item.totalLessons;
    const unexcused = item.unexcused;
    const excused = item.excused;
    const totalAbs = unexcused + excused;
    const unexcusedPct = lessons > 0 ? (unexcused / lessons) * 100 : 0;
    const excusedPct = lessons > 0 ? (excused / lessons) * 100 : 0;
    const totalAbsPct = lessons > 0 ? (totalAbs / lessons) * 100 : 0;

    const threshold = (typeof state.absenceWarningThreshold === 'number' && !isNaN(state.absenceWarningThreshold))
      ? state.absenceWarningThreshold
      : 50;
    const cautionThreshold = Math.max(1, threshold - 10);

    const isRisk = unexcusedPct >= threshold;
    const isCaution = !isRisk && unexcused > 0 && unexcusedPct >= cautionThreshold;

    if (isRisk) {
      card.classList.add('has-risk');
    } else if (isCaution) {
      card.classList.add('has-warning');
    }

    // Отрисовка бейджей оценок
    let marksListHtml = '';
    if (marks.length === 0) {
      marksListHtml = `<span class="no-marks-stub">Нет выставленных оценок</span>`;
    } else {
      marksListHtml = marks.map(m => `<span class="mark-badge mark-badge-${m}">${m}</span>`).join('');
    }

    // Индикатор риска и приближения к порогу
    let riskHtml = '';
    if (isRisk) {
      riskHtml = `
        <div class="risk-warning-badge">
          ⚠️ Риск неаттестации: ${unexcusedPct.toFixed(1)}% прогулов (установленный порог — ${threshold}%)
        </div>
      `;
    } else if (isCaution) {
      riskHtml = `
        <div class="risk-caution-badge">
          ⚡ Приближение к порогу: ${unexcusedPct.toFixed(1)}% прогулов (лимит — ${threshold}%)
        </div>
      `;
    }

    // Расчет запаса прочности по прогулам
    const isCurrentMode = mode === 'current';
    const baseLessons = isCurrentMode ? (item.passedLessons || 0) : (item.totalPlanned || 0);
    const currentN = item.unexcused || 0;

    // Максимально допустимое количество прогулов («Н») до порога,
    // чтобы процент оставался строго ниже установленного порога:
    const maxAllowedSkips = baseLessons > 0
      ? Math.max(0, Math.ceil(baseLessons * (threshold / 100)) - 1)
      : 0;
    const remainingSkips = maxAllowedSkips - currentN;
    const periodSuffix = isCurrentMode ? 'на сегодня' : 'за период';

    let safetyMarginHtml = '';
    if (baseLessons === 0) {
      safetyMarginHtml = `
        <div class="skips-safety-box skips-safety-empty">
          <span class="skips-subtext">${isCurrentMode ? 'Нет прошедших уроков на текущий день' : 'Нет запланированных уроков в расписании выбранного периода'}</span>
        </div>
      `;
    } else if (remainingSkips > 0) {
      const skipsText = formatCountWithWord(remainingSkips, 'урок', 'урока', 'уроков');
      safetyMarginHtml = `
        <div class="skips-safety-box skips-safety-safe" title="Количество уроков, которые можно пропустить со статусом «Н» без превышения порога ${threshold}% (${periodSuffix})">
          <span class="skips-safety-title">🟢 Можно еще скипнуть: ${skipsText}</span>
          <span class="skips-subtext">(из ${maxAllowedSkips} допустимых ${periodSuffix})</span>
        </div>
      `;
    } else if (remainingSkips === 0) {
      safetyMarginHtml = `
        <div class="skips-safety-box skips-safety-exhausted" title="Следующий прогул превысит установленный порог ${threshold}% (${periodSuffix})">
          <span class="skips-safety-title">🟡 Запас исчерпан: 0 уроков</span>
          <span class="skips-subtext">(следующий прогул превысит порог)</span>
        </div>
      `;
    } else {
      const exceeded = Math.abs(remainingSkips);
      const exceededText = formatCountWithWord(exceeded, 'урок', 'урока', 'уроков');
      safetyMarginHtml = `
        <div class="skips-safety-box skips-safety-exceeded" title="Порог риска ${threshold}% превышен">
          <span class="skips-safety-title">🔴 Лимит превышен на ${exceededText}</span>
          <span class="skips-subtext">(порог: ${threshold}%)</span>
        </div>
      `;
    }

    // Индикатор минимального количества оценок для аттестации
    const minGrades = (typeof state.minGradesForAttestation === 'number' && !isNaN(state.minGradesForAttestation))
      ? state.minGradesForAttestation
      : 3;
    const marksCount = marks.length;

    let attestationBadgeHtml = '';
    if (marksCount < minGrades) {
      const needed = minGrades - marksCount;
      attestationBadgeHtml = `
        <span class="attestation-badge attestation-badge-warning" title="Для аттестации по предмету требуется минимум ${minGrades} оценок">
          Нужно еще ${needed} оц. для аттестации
        </span>
      `;
    } else {
      attestationBadgeHtml = `
        <span class="attestation-badge attestation-badge-ok" title="Минимум оценок для аттестации (${minGrades}) набран">
          ✓ Минимум для аттестации есть
        </span>
      `;
    }

    const avgDisplay = avg !== null ? avg.toFixed(2) : '—';

    card.innerHTML = `
      <div class="subject-header-row">
        <div class="subject-name-box">
          <span class="subject-title">${escapeHtml(item.name)}</span>
        </div>
        <div class="grade-badge-group">
          <span class="avg-score-text">Ср. балл: <span class="avg-score-val">${avgDisplay}</span></span>
          <span class="projected-grade-badge ${projected.class}" title="Прогнозируемая оценка">
            Итог: ${projected.grade}
          </span>
        </div>
      </div>

      <div class="subject-marks-row">
        <div class="marks-row-header">
          <span>Оценки (${marksCount}):</span>
          ${attestationBadgeHtml}
        </div>
        <div class="subject-marks-list">
          ${marksListHtml}
        </div>
      </div>

      <div class="smart-goal-box">
        <span class="goal-icon">${goal.icon}</span>
        <div class="goal-text-content">
          <div class="goal-title">${goal.title}</div>
          <div class="goal-needed">${goal.text}</div>
        </div>
      </div>

      <div class="subject-att-section">
        <div class="att-metrics-row">
          <span>Уроков: <strong>${lessons}</strong></span>
          <span>Н: <strong class="text-danger">${unexcused}</strong></span>
          <span>У: <strong class="text-info">${excused}</strong></span>
          <span>Пропуски: <strong>${totalAbsPct.toFixed(1)}%</strong></span>
        </div>

        <div class="att-progress-track" title="Пропуски: Н (${unexcusedPct.toFixed(1)}%), У (${excusedPct.toFixed(1)}%)">
          <div class="att-progress-unexcused" style="width: ${unexcusedPct}%;"></div>
          <div class="att-progress-excused" style="width: ${excusedPct}%;"></div>
          <div class="att-progress-present"></div>
        </div>

        ${safetyMarginHtml}
        ${riskHtml}
      </div>
    `;

    return card;
  }

  function getProjectedGrade(avg) {
    if (avg === null || isNaN(avg)) return { grade: '—', class: 'projected-grade-none' };
    if (avg >= 4.50) return { grade: '5', class: 'projected-grade-5' };
    if (avg >= 3.50) return { grade: '4', class: 'projected-grade-4' };
    if (avg >= 2.50) return { grade: '3', class: 'projected-grade-3' };
    return { grade: '2', class: 'projected-grade-2' };
  }

  function calculateSmartGoal(marks) {
    if (!marks || marks.length === 0) {
      return {
        status: 'no_marks',
        title: 'Калькулятор «До цели»',
        text: 'Выставите оценки в Дневнике для расчета рекомендаций',
        icon: '🎯'
      };
    }

    const sum = marks.reduce((a, b) => a + b, 0);
    const n = marks.length;
    const avg = sum / n;

    if (avg >= 4.50) {
      return {
        status: 'achieved_5',
        title: 'Цель достигнута',
        text: 'Текущий средний балл соответствует отличной оценке «5» ⭐',
        icon: '⭐'
      };
    }

    if (avg >= 3.50) {
      const diff = 4.5 * n - sum;
      let k = Math.ceil(2 * diff);
      if (k <= 0) k = 1;

      const fiveWord = formatCountWithWord(k, 'пятерка', 'пятерки', 'пятерок');
      return {
        status: 'need_5',
        title: 'До оценки «5» (порог 4.50)',
        text: `Нужно получить подряд: <span class="goal-highlight-5">${k} × «5»</span> (${fiveWord}) без других отметок`,
        icon: '🎯'
      };
    }

    const diff = 3.5 * n - sum;
    let m = Math.ceil(diff / 1.5);
    if (m <= 0) m = 1;

    let k = Math.ceil(2 * diff);
    if (k <= 0) k = 1;

    const fiveWord = formatCountWithWord(m, 'пятерку', 'пятерки', 'пятерок');
    const fourWord = formatCountWithWord(k, 'четверку', 'четверки', 'четверок');

    return {
      status: 'need_4',
      title: 'Выход из зоны риска (цель «4»)',
      text: `Чтобы выйти на «4» (порог 3.50), нужно: <span class="goal-highlight-5">${m} × «5»</span> (${fiveWord}) или <span class="goal-highlight-4">${k} × «4»</span> (${fourWord}) подряд`,
      icon: '🚀'
    };
  }

  function formatCountWithWord(num, one, twoFour, many) {
    const n = Math.abs(num) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return `${num} ${many}`;
    if (n1 > 1 && n1 < 5) return `${num} ${twoFour}`;
    if (n1 === 1) return `${num} ${one}`;
    return `${num} ${many}`;
  }

  /* ==========================================================================
     4. Блок «Даты семестров»
     ========================================================================== */
  function initSemesterDates() {
    const sem1Start = document.getElementById('sem1-start');
    const sem1End = document.getElementById('sem1-end');
    const sem2Start = document.getElementById('sem2-start');
    const sem2End = document.getElementById('sem2-end');

    sem1Start.value = state.semesters.sem1Start || '';
    sem1End.value = state.semesters.sem1End || '';
    sem2Start.value = state.semesters.sem2Start || '';
    sem2End.value = state.semesters.sem2End || '';

    const fields = [
      { el: sem1Start, key: 'sem1Start' },
      { el: sem1End, key: 'sem1End' },
      { el: sem2Start, key: 'sem2Start' },
      { el: sem2End, key: 'sem2End' }
    ];

    fields.forEach(({ el, key }) => {
      el.addEventListener('change', () => {
        state.semesters[key] = el.value;
        saveSettings();
        renderDiaryWeek();
        renderStats();
        showToast('Даты семестра обновлены', 'info');
      });
    });
  }

  /* ==========================================================================
     Контроль посещаемости: Порог риска неаттестации
     ========================================================================== */
  function initAbsenceThresholdSetting() {
    const input = document.getElementById('absence-threshold-input');
    if (!input) return;

    input.value = typeof state.absenceWarningThreshold === 'number'
      ? state.absenceWarningThreshold
      : 50;

    const commitThreshold = () => {
      let val = parseInt(input.value, 10);
      if (isNaN(val)) {
        val = 50;
      }
      val = Math.max(10, Math.min(100, val));
      input.value = val;

      if (state.absenceWarningThreshold !== val) {
        state.absenceWarningThreshold = val;
        saveSettings();
        renderStats();
        showToast(`Порог риска неаттестации установлен: ${val}%`, 'info');
      }
    };

    input.addEventListener('change', commitThreshold);
    input.addEventListener('input', () => {
      const val = parseInt(input.value, 10);
      if (!isNaN(val) && val >= 10 && val <= 100) {
        state.absenceWarningThreshold = val;
        saveSettings();
        renderStats();
      }
    });
  }

  /* ==========================================================================
     Минимум оценок для аттестации
     ========================================================================== */
  function initMinGradesSetting() {
    const input = document.getElementById('min-grades-input');
    if (!input) return;

    input.value = typeof state.minGradesForAttestation === 'number'
      ? state.minGradesForAttestation
      : 3;

    const commitMinGrades = () => {
      let val = parseInt(input.value, 10);
      if (isNaN(val)) {
        val = 3;
      }
      val = Math.max(1, Math.min(20, val));
      input.value = val;

      if (state.minGradesForAttestation !== val) {
        state.minGradesForAttestation = val;
        saveSettings();
        renderStats();
        showToast(`Минимум оценок для аттестации: ${val}`, 'info');
      }
    };

    input.addEventListener('change', commitMinGrades);
    input.addEventListener('input', () => {
      const val = parseInt(input.value, 10);
      if (!isNaN(val) && val >= 1 && val <= 20) {
        state.minGradesForAttestation = val;
        saveSettings();
        renderStats();
      }
    });
  }

  /* ==========================================================================
     5. Блок «Каникулы и праздники»
     ========================================================================== */
  function initHolidays() {
    const form = document.getElementById('holiday-form');
    const titleInput = document.getElementById('holiday-title');
    const startInput = document.getElementById('holiday-start');
    const endInput = document.getElementById('holiday-end');

    renderHolidaysList();

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const title = titleInput.value.trim();
      const start = startInput.value;
      const end = endInput.value;

      if (!title || !start || !end) {
        showToast('Заполните все поля периода', 'error');
        return;
      }

      if (start > end) {
        showToast('Дата начала не может быть позже окончания', 'error');
        return;
      }

      const newHoliday = {
        id: 'holiday-' + Date.now(),
        title,
        start,
        end
      };

      state.holidays.push(newHoliday);
      saveSettings();
      renderHolidaysList();
      renderDiaryWeek();
      renderStats();

      form.reset();
      showToast(`Период «${title}» добавлен`, 'success');
    });
  }

  function renderHolidaysList() {
    const container = document.getElementById('holidays-list');
    container.innerHTML = '';

    if (!state.holidays || state.holidays.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          Нет добавленных каникул или праздничных периодов
        </div>
      `;
      return;
    }

    const sorted = [...state.holidays].sort((a, b) => a.start.localeCompare(b.start));

    sorted.forEach(item => {
      const row = document.createElement('div');
      row.className = 'holiday-item';

      const formattedRange = `${formatDate(item.start)} — ${formatDate(item.end)}`;

      row.innerHTML = `
        <div class="holiday-info">
          <span class="holiday-title">${escapeHtml(item.title)}</span>
          <span class="holiday-dates">${formattedRange}</span>
        </div>
        <button type="button" class="btn-icon-only" title="Удалить период" data-id="${item.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      `;

      const deleteBtn = row.querySelector('button');
      deleteBtn.addEventListener('click', () => {
        deleteHoliday(item.id, item.title);
      });

      container.appendChild(row);
    });
  }

  function deleteHoliday(id, title) {
    state.holidays = state.holidays.filter(h => h.id !== id);
    saveSettings();
    renderHolidaysList();
    renderDiaryWeek();
    renderStats();
    showToast(`Период «${title}» удален`, 'info');
  }

  /* ==========================================================================
     6. Блок «Расписание недели»
     ========================================================================== */
  function initSubjectsManager() {
    const input = document.getElementById('new-subject-input');
    const addBtn = document.getElementById('add-subject-btn');

    renderSubjectsTags();

    function handleAdd() {
      const subjectName = input.value.trim();
      if (!subjectName) {
        showToast('Введите название предмета', 'error');
        return;
      }

      const isDuplicate = state.subjects.some(
        s => s.toLowerCase() === subjectName.toLowerCase()
      );

      if (isDuplicate) {
        showToast(`Предмет «${subjectName}» уже есть в списке`, 'error');
        return;
      }

      state.subjects.push(subjectName);
      saveSettings();
      renderSubjectsTags();
      refreshAllDaySelects();
      renderDiaryWeek();
      renderStats();
      input.value = '';
      showToast(`Предмет «${subjectName}» добавлен`, 'success');
    }

    addBtn.addEventListener('click', handleAdd);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    });
  }

  function renderSubjectsTags() {
    const container = document.getElementById('subjects-container');
    container.innerHTML = '';

    state.subjects.forEach(subject => {
      const tag = document.createElement('div');
      tag.className = 'subject-tag';
      tag.innerHTML = `
        <span>${escapeHtml(subject)}</span>
        <button type="button" class="subject-remove-btn" title="Удалить предмет" data-subject="${escapeHtml(subject)}">
          &times;
        </button>
      `;

      tag.querySelector('.subject-remove-btn').addEventListener('click', () => {
        removeSubject(subject);
      });

      container.appendChild(tag);
    });
  }

  function removeSubject(subjectName) {
    if (state.subjects.length <= 1) {
      showToast('Должен остаться хотя бы один предмет', 'error');
      return;
    }

    state.subjects = state.subjects.filter(s => s !== subjectName);

    WEEK_DAYS.forEach(day => {
      if (Array.isArray(state.schedule[day.key])) {
        state.schedule[day.key] = state.schedule[day.key].map(slot =>
          slot === subjectName ? '' : slot
        );
      }
    });

    saveSettings();
    renderSubjectsTags();
    refreshAllDaySelects();
    renderDiaryWeek();
    renderStats();
    showToast(`Предмет «${subjectName}» удален`, 'info');
  }

  function initWeekSchedule() {
    const container = document.getElementById('week-schedule-grid');
    container.innerHTML = '';

    WEEK_DAYS.forEach(day => {
      const dayCard = document.createElement('div');
      dayCard.className = 'day-card';
      dayCard.id = `day-card-${day.key}`;

      const lessons = state.schedule[day.key] || [];

      dayCard.innerHTML = `
        <div class="day-header">
          <span class="day-name">${day.name}</span>
          <span class="day-count" id="count-${day.key}">Уроков: ${lessons.filter(s => s && s.trim()).length}</span>
        </div>
        <div class="lessons-list" id="lessons-list-${day.key}">
        </div>
        <button type="button" class="btn add-lesson-btn" data-day="${day.key}">
          + Добавить урок
        </button>
      `;

      const addBtn = dayCard.querySelector('.add-lesson-btn');
      addBtn.addEventListener('click', () => {
        addLessonToDay(day.key);
      });

      container.appendChild(dayCard);
      renderLessonsForDay(day.key);
    });
  }

  function renderLessonsForDay(dayKey) {
    const listContainer = document.getElementById(`lessons-list-${dayKey}`);
    const countEl = document.getElementById(`count-${dayKey}`);
    if (!listContainer) return;

    listContainer.innerHTML = '';
    const lessons = state.schedule[dayKey] || [];
    const activeCount = lessons.filter(s => s && s.trim()).length;

    if (countEl) {
      countEl.textContent = `Уроков: ${activeCount}`;
    }

    if (lessons.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state" style="padding: 12px; font-size: 0.8rem;">
          Нет уроков в этот день (выходной)
        </div>
      `;
      return;
    }

    lessons.forEach((selectedSubject, index) => {
      const lessonRow = document.createElement('div');
      lessonRow.className = 'lesson-row';

      let optionsHtml = `<option value="">— Выберите предмет —</option>`;
      state.subjects.forEach(subj => {
        const isSelected = subj === selectedSubject ? 'selected' : '';
        optionsHtml += `<option value="${escapeHtml(subj)}" ${isSelected}>${escapeHtml(subj)}</option>`;
      });

      lessonRow.innerHTML = `
        <span class="lesson-number">${index + 1}</span>
        <select class="lesson-select" data-day="${dayKey}" data-index="${index}">
          ${optionsHtml}
        </select>
        <button type="button" class="btn-icon-only" title="Удалить урок" data-day="${dayKey}" data-index="${index}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      `;

      const select = lessonRow.querySelector('select');
      select.addEventListener('change', (e) => {
        state.schedule[dayKey][index] = e.target.value;
        saveSettings();
        renderDiaryWeek();
        renderStats();
        if (countEl) {
          countEl.textContent = `Уроков: ${state.schedule[dayKey].filter(s => s && s.trim()).length}`;
        }
      });

      const deleteBtn = lessonRow.querySelector('.btn-icon-only');
      deleteBtn.addEventListener('click', () => {
        deleteLessonFromDay(dayKey, index);
      });

      listContainer.appendChild(lessonRow);
    });
  }

  function addLessonToDay(dayKey) {
    if (!state.schedule[dayKey]) {
      state.schedule[dayKey] = [];
    }

    const defaultNewLesson = state.subjects.length > 0 ? state.subjects[0] : '';
    state.schedule[dayKey].push(defaultNewLesson);
    saveSettings();
    renderLessonsForDay(dayKey);
    renderDiaryWeek();
    renderStats();
  }

  function deleteLessonFromDay(dayKey, index) {
    if (state.schedule[dayKey]) {
      state.schedule[dayKey].splice(index, 1);
      saveSettings();
      renderLessonsForDay(dayKey);
      renderDiaryWeek();
      renderStats();
    }
  }

  function refreshAllDaySelects() {
    WEEK_DAYS.forEach(day => {
      renderLessonsForDay(day.key);
    });
  }

  /* ==========================================================================
     7. Блок «Резервная копия» (Импорт и экспорт JSON)
     ========================================================================== */
  function initBackupActions() {
    const exportBtn = document.getElementById('export-json-btn');
    const importInput = document.getElementById('import-json-input');
    const resetBtn = document.getElementById('reset-defaults-btn');

    exportBtn.addEventListener('click', () => {
      exportToJsonFile();
    });

    importInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result);

          if (!imported || typeof imported !== 'object') {
            throw new Error('Файл не содержит валидный JSON объект');
          }

          state = sanitizeLoadedState(imported);
          saveSettings();
          refreshWholeUI();

          showToast('Настройки, расписание и оценки успешно загружены!', 'success');
        } catch (err) {
          console.error('Ошибка разбора JSON:', err);
          showToast('Ошибка при загрузке JSON: некорректный формат файла', 'error');
        } finally {
          importInput.value = '';
        }
      };

      reader.readAsText(file);
    });

    resetBtn.addEventListener('click', () => {
      const confirmed = confirm('Вы уверены, что хотите сбросить все настройки, расписание и оценки к начальным значениям?');
      if (confirmed) {
        state = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        saveSettings();
        refreshWholeUI();

        showToast('Все данные сброшены к базовым значениям', 'info');
      }
    });
  }

  function exportToJsonFile() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
    const now = new Date();
    const dateFormatted = now.toISOString().slice(0, 10);
    const fileName = `diary_10th_grade_full_${dateFormatted}.json`;

    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', fileName);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showToast(`Файл «${fileName}» скачан`, 'success');
  }

  /* ==========================================================================
     Облачная синхронизация (Supabase REST API)
     ========================================================================== */
  let cloudSyncDebounceTimer = null;
  let currentSyncStatus = { type: 'disabled', detail: '' };

  function getSyncId() {
    return (localStorage.getItem(SYNC_STORAGE_KEY) || '').trim();
  }

  function setSyncId(id) {
    if (id && typeof id === 'string' && id.trim()) {
      localStorage.setItem(SYNC_STORAGE_KEY, id.trim());
    } else {
      localStorage.removeItem(SYNC_STORAGE_KEY);
    }
  }

  function formatSyncTime(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) return '';
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function updateSyncStatus(statusType, detail = '') {
    currentSyncStatus = { type: statusType, detail };
    const headerBadge = document.getElementById('header-sync-badge');
    const settingsBadge = document.getElementById('settings-sync-status');

    let text = '';
    let className = 'sync-status-badge ';

    switch (statusType) {
      case 'synced':
        text = `☁ Синхронизировано (${detail || formatSyncTime(new Date())})`;
        className += 'sync-status-synced';
        break;
      case 'saving':
        text = '🔄 Сохранение...';
        className += 'sync-status-saving';
        break;
      case 'error':
        text = detail ? (detail.startsWith('⚠') ? detail : `⚠ ${detail}`) : '⚠ Ошибка сети (работает локально)';
        className += 'sync-status-error';
        break;
      case 'disabled':
      default:
        text = '☁ Облако отключено';
        className += 'sync-status-disabled';
        break;
    }

    if (headerBadge) {
      headerBadge.className = className;
      headerBadge.textContent = text;
      headerBadge.title = text;
    }
    if (settingsBadge) {
      settingsBadge.className = className;
      settingsBadge.textContent = text;
      settingsBadge.title = text;
    }
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return res;
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutError = new Error('Таймаут (10 сек) / Нет связи с сервером');
        timeoutError.isTimeout = true;
        throw timeoutError;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function extractErrorMessage(res) {
    let detail = '';
    try {
      const text = await res.text();
      if (text) {
        try {
          const json = JSON.parse(text);
          detail = json.message || json.error_description || json.msg || json.error || text;
        } catch (_) {
          detail = text.length > 80 ? text.substring(0, 80) + '...' : text;
        }
      }
    } catch (_) {}

    if (detail) {
      return `Ошибка API (${res.status}): ${detail}`;
    }
    return `Ошибка API (${res.status})`;
  }

  function formatErrorForUI(err) {
    if (!err) return '⚠ Ошибка сети (работает локально)';
    const msg = err.message || String(err);
    if (err.isTimeout || err.name === 'AbortError' || msg.includes('Таймаут')) {
      return '⚠ Таймаут / Нет связи с сервером';
    }
    if (msg.startsWith('Ошибка API') || msg.startsWith('⚠ Ошибка API')) {
      return msg.startsWith('⚠') ? msg : `⚠ ${msg}`;
    }
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Network request failed')) {
      return '⚠ Нет связи с сервером (Failed to fetch)';
    }
    return `⚠ ${msg}`;
  }

  function triggerCloudSyncDebounced() {
    const syncId = getSyncId();
    if (!syncId) return;

    updateSyncStatus('saving');

    if (cloudSyncDebounceTimer) {
      clearTimeout(cloudSyncDebounceTimer);
    }

    cloudSyncDebounceTimer = setTimeout(async () => {
      await pushToCloud();
    }, 800);
  }

  async function pushToCloud() {
    const syncId = getSyncId();
    if (!syncId) {
      updateSyncStatus('disabled');
      return false;
    }

    updateSyncStatus('saving');
    const nowISO = new Date().toISOString();
    state.lastUpdated = nowISO;
    try {
      localStorage.setItem(LAST_UPDATED_KEY, nowISO);
    } catch (_) {}

    try {
      const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${SYNC_TABLE}`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
          sync_id: syncId,
          payload: state,
          updated_at: nowISO
        })
      }, 10000);

      if (!res.ok) {
        const errMsg = await extractErrorMessage(res);
        throw new Error(errMsg);
      }

      const timeStr = formatSyncTime(nowISO);
      updateSyncStatus('synced', timeStr);
      return true;
    } catch (err) {
      const errText = formatErrorForUI(err);
      console.warn('Ошибка облачной синхронизации (сохранено локально):', err);
      updateSyncStatus('error', errText);
      return false;
    }
  }

  async function pullFromCloud(silent = true) {
    const syncId = getSyncId();
    if (!syncId) {
      updateSyncStatus('disabled');
      return { success: false, reason: 'no_sync_id' };
    }

    updateSyncStatus('saving');

    try {
      const url = `${SUPABASE_URL}/rest/v1/${SYNC_TABLE}?sync_id=eq.${encodeURIComponent(syncId)}&select=*`;
      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY
        }
      }, 10000);

      if (!res.ok) {
        const errMsg = await extractErrorMessage(res);
        throw new Error(errMsg);
      }

      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0 && rows[0]) {
        const record = rows[0];
        const cloudDate = record.updated_at ? new Date(record.updated_at).getTime() : 0;
        const localLastUpdated = localStorage.getItem(LAST_UPDATED_KEY) || state.lastUpdated || '1970-01-01T00:00:00.000Z';
        const localDate = new Date(localLastUpdated).getTime();

        if (cloudDate > localDate && record.payload) {
          const sanitized = sanitizeLoadedState(record.payload);
          if (sanitized) {
            state = sanitized;
            state.lastUpdated = record.updated_at;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            localStorage.setItem(LAST_UPDATED_KEY, record.updated_at);

            refreshWholeUI();

            if (!silent) {
              showToast('Данные синхронизированы из облака', 'success');
            }
          }
        } else if (localDate > cloudDate) {
          // Локальные данные новее — отправляем их в облако
          await pushToCloud();
          return { success: true, record, pushed: true };
        }

        const syncTime = formatSyncTime(record.updated_at || new Date());
        updateSyncStatus('synced', syncTime);
        return { success: true, record };
      } else {
        // Записи в облаке еще нет — инициализируем текущими данными
        await pushToCloud();
        return { success: true, notFound: true };
      }
    } catch (err) {
      const errText = formatErrorForUI(err);
      console.warn('Ошибка загрузки из облака (работает локально):', err);
      updateSyncStatus('error', errText);
      if (!silent) {
        showToast(errText, 'error');
      }
      return { success: false, error: err };
    }
  }

  function refreshWholeUI() {
    updateSettingsInputs();
    renderHolidaysList();
    renderSubjectsTags();
    refreshAllDaySelects();
    renderDiaryWeek();
    renderStats();
  }

  function updateSettingsInputs() {
    const sem1Start = document.getElementById('sem1-start');
    const sem1End = document.getElementById('sem1-end');
    const sem2Start = document.getElementById('sem2-start');
    const sem2End = document.getElementById('sem2-end');
    if (sem1Start) sem1Start.value = state.semesters.sem1Start || '';
    if (sem1End) sem1End.value = state.semesters.sem1End || '';
    if (sem2Start) sem2Start.value = state.semesters.sem2Start || '';
    if (sem2End) sem2End.value = state.semesters.sem2End || '';

    const absenceInput = document.getElementById('absence-threshold-input');
    if (absenceInput) absenceInput.value = state.absenceWarningThreshold;

    const minGradesInput = document.getElementById('min-grades-input');
    if (minGradesInput) minGradesInput.value = state.minGradesForAttestation;
  }

  function generateSyncId() {
    const part1 = Math.random().toString(36).substring(2, 7);
    const part2 = Math.random().toString(36).substring(2, 7);
    return `diary-${part1}-${part2}`;
  }

  function updateSyncUI() {
    const syncId = getSyncId();
    const input = document.getElementById('sync-id-input');
    const copyBtn = document.getElementById('sync-copy-btn');
    const disconnectBtn = document.getElementById('sync-disconnect-btn');

    if (input) {
      input.value = syncId;
    }
    if (copyBtn) {
      copyBtn.style.display = syncId ? 'inline-flex' : 'none';
    }
    if (disconnectBtn) {
      disconnectBtn.disabled = !syncId;
      disconnectBtn.style.opacity = syncId ? '1' : '0.5';
    }
  }

  async function handleConnectSync() {
    const input = document.getElementById('sync-id-input');
    if (!input) return;
    const syncId = input.value.trim();
    if (!syncId) {
      showToast('Введите или сгенерируйте ключ синхронизации', 'error');
      input.focus();
      return;
    }

    updateSyncStatus('saving');

    try {
      // 1. Сначала делаем GET запрос, чтобы проверить наличие данных в облаке
      const url = `${SUPABASE_URL}/rest/v1/${SYNC_TABLE}?sync_id=eq.${encodeURIComponent(syncId)}&select=*`;
      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY
        }
      }, 10000);

      if (!res.ok) {
        const errMsg = await extractErrorMessage(res);
        throw new Error(errMsg);
      }

      const rows = await res.json();
      setSyncId(syncId);

      if (Array.isArray(rows) && rows.length > 0 && rows[0] && rows[0].payload) {
        const record = rows[0];
        const sanitized = sanitizeLoadedState(record.payload);
        if (sanitized) {
          state = sanitized;
          state.lastUpdated = record.updated_at || new Date().toISOString();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          localStorage.setItem(LAST_UPDATED_KEY, state.lastUpdated);

          refreshWholeUI();

          const syncTime = formatSyncTime(record.updated_at || new Date());
          updateSyncStatus('synced', syncTime);
          showToast('Ключ подключен! Данные успешно загружены из облака', 'success');
          updateSyncUI();
          return;
        }
      }

      // Если в облаке еще нет данных (новый ключ) — отправляем локальный стейт
      const pushed = await pushToCloud();
      if (pushed) {
        showToast('Ключ подключен! Данные сохранены в облако', 'success');
      }
      updateSyncUI();
    } catch (err) {
      const errText = formatErrorForUI(err);
      console.warn('Ошибка подключения к облаку:', err);
      setSyncId(syncId);
      updateSyncStatus('error', errText);
      showToast(errText, 'error');
      updateSyncUI();
    }
  }

  function handleDisconnectSync() {
    const currentId = getSyncId();
    if (!currentId) {
      showToast('Облачная синхронизация не подключена', 'info');
      return;
    }

    const confirmed = confirm('Отключить облачную синхронизацию? Все данные сохранятся в этом браузере.');
    if (!confirmed) return;

    if (cloudSyncDebounceTimer) {
      clearTimeout(cloudSyncDebounceTimer);
      cloudSyncDebounceTimer = null;
    }

    setSyncId('');
    const input = document.getElementById('sync-id-input');
    if (input) input.value = '';

    updateSyncStatus('disabled');
    updateSyncUI();
    showToast('Облачная синхронизация отключена', 'info');
  }

  function handleGenerateSyncId() {
    const newId = generateSyncId();
    const input = document.getElementById('sync-id-input');
    if (input) {
      input.value = newId;
      input.focus();
    }
    showToast('Новый ключ сгенерирован. Нажмите «Подключить и синхронизировать»', 'info');
  }

  async function handleCopySyncId() {
    const syncId = getSyncId() || (document.getElementById('sync-id-input')?.value || '').trim();
    if (!syncId) {
      showToast('Ключ не задан', 'error');
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(syncId);
        showToast('Ключ скопирован в буфер обмена', 'success');
      } else {
        const input = document.getElementById('sync-id-input');
        if (input) {
          input.select();
          document.execCommand('copy');
          showToast('Ключ скопирован в буфер обмена', 'success');
        }
      }
    } catch (_) {
      showToast('Выделите и скопируйте ключ вручную', 'info');
    }
  }

  function initCloudSync() {
    const connectBtn = document.getElementById('sync-connect-btn');
    const disconnectBtn = document.getElementById('sync-disconnect-btn');
    const generateBtn = document.getElementById('sync-generate-btn');
    const copyBtn = document.getElementById('sync-copy-btn');
    const input = document.getElementById('sync-id-input');
    const headerStatus = document.getElementById('header-sync-status');

    if (connectBtn) connectBtn.addEventListener('click', handleConnectSync);
    if (disconnectBtn) disconnectBtn.addEventListener('click', handleDisconnectSync);
    if (generateBtn) generateBtn.addEventListener('click', handleGenerateSyncId);
    if (copyBtn) copyBtn.addEventListener('click', handleCopySyncId);

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleConnectSync();
        }
      });
    }

    if (headerStatus) {
      headerStatus.addEventListener('click', () => {
        if (typeof switchTab === 'function') {
          switchTab('settings');
        }
        const syncCard = document.querySelector('.sync-card');
        if (syncCard) {
          syncCard.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    window.addEventListener('online', () => {
      if (getSyncId()) {
        pushToCloud();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && getSyncId()) {
        pullFromCloud(true);
      }
    });

    updateSyncUI();

    // Проверяем облако при загрузке, если задан sync_id
    if (getSyncId()) {
      pullFromCloud(true);
    } else {
      updateSyncStatus('disabled');
    }
  }

  /* ==========================================================================
     Утилиты дат и форматирования
     ========================================================================== */
  function parseISODate(str) {
    if (!str) return new Date();
    const parts = str.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function toISODate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function addDays(d, days) {
    const result = new Date(d);
    result.setDate(result.getDate() + days);
    return result;
  }

  function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay(); // 0 - Вс, 1 - Пн ...
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.getFullYear(), date.getMonth(), diff);
  }

  function formatDateRussianRange(d1, d2) {
    const m1 = RU_MONTHS_GENITIVE[d1.getMonth()];
    const m2 = RU_MONTHS_GENITIVE[d2.getMonth()];
    const y1 = d1.getFullYear();
    const y2 = d2.getFullYear();

    if (y1 === y2) {
      if (d1.getMonth() === d2.getMonth()) {
        return `${d1.getDate()} — ${d2.getDate()} ${m1} ${y1} г.`;
      }
      return `${d1.getDate()} ${m1} — ${d2.getDate()} ${m2} ${y1} г.`;
    }
    return `${d1.getDate()} ${m1} ${y1} г. — ${d2.getDate()} ${m2} ${y2} г.`;
  }

  function formatDateShortRussian(d) {
    return `${d.getDate()} ${RU_MONTHS_GENITIVE[d.getMonth()]}`;
  }

  function formatDate(isoDateStr) {
    if (!isoDateStr) return '—';
    const parts = isoDateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return isoDateStr;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* ==========================================================================
     Всплывающие уведомления (Toast)
     ========================================================================== */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

})();

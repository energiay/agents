/**
 * Логирует значение с указанным именем.
 * @param {any} value - Значение для логирования.
 * @param {string} [name] - Необязательное имя лога.
 * @returns {void}
 */
function addLog(value, name) {
    var sLogName = name
    if (sLogName == undefined) {
        sLogName = 'adaptation_admin'
    }

    EnableLog(sLogName)
    LogEvent(sLogName, value)
}

/**
 * Получает активные адаптации.
 * @returns {object} Результат выполнения запроса.
 */
function getAdaptations() {
    var query = "
        SELECT cr.*
        FROM career_reserves as cr
        LEFT JOIN collaborators as cs on cs.id = cr.person_id
        WHERE cr.code = 'mb_new_employees_adaptation_ssp'
        AND cr.status = 'active'
        AND cs.is_dismiss = 0
        --AND cr.id in (
        --    7264842427154538051
        --    ,7264562922959768513
        --)
        ORDER BY cr.start_date desc
    "

    return XQuery("sql: " + query)
}

/**
 * Получает определенную задачу из программы по её ID.
 * @param {object} params - Объект параметров.
 * @param {string} params.def_prog_id - ID типовой программы
 * @param {string} params.task_id - ID задачи для поиска
 * @returns {object | null} Объект задачи или null, если не найдена.
 */
function getDefTask(params) {
    var card = tools.open_doc(params.def_prog_id)
    if (card == undefined) {
        return null
    }

    var activity = getActivity(card.TopElem.tasks, params.task_id)
    if (activity == undefined) {
        return null
    }

    return activity
}

/**
 * Добавляет учебную программу к карточке адаптации.
 * @param {XmDoc} card - Адаптация
 * @param {object} params - Параметры
 * @param {object} defTask - учебная программа из типовой программы
 * @returns {string|null} Идентификатор новой активности или null.
 */
function addEducationMethod(card, params, defTask) {
    var parentStage = getParentStage(card.TopElem.tasks, params.stage_id)
    var id = card.TopElem.set_task(defTask, params.def_prog_id, parentStage.id)

    card.Save()

    return id
}


/**
 * Находит активность в списке задач по указанному ID.
 * @param {Array<object>} tasks - Список активностей.
 * @param {string} id - ID для поиска активности.
 * @returns {object|undefined} Найденный объект активности или undefined.
 */
function getActivity(tasks, id) {
    var sWhere = "StrBegins(String(This.id), '" + id + "', true)"

    return ArrayOptFind(tasks, sWhere)
}

/**
 * Находит этап (stage) по ID среди задач.
 * @param {Array<object>} tasks - Массив задач для поиска.
 * @param {string|number} id - ID этапа для поиска.
 * @returns {object|undefined} Найденный объект этапа или undefined.
 */
function getParentStage(tasks, id) {
    var sWhere = "This.parent_task_id == '' && This.type == 'stage' "
    sWhere += "&& StrBegins(String(This.id), '" + id + "', true)"

    return ArrayOptFind(tasks, sWhere)
}

/**
 * Проверяет наличие задачи с определенным статусом в карточке.
 * @param {object} card - Объект карточки, содержащий список задач.
 * @param {object} params - Параметры для проверки, включая задачи и статус.
 * @returns {boolean} Возвращает true, если не найдено задач с указанным статусом.
 */
function check(card, params) {
    // если активность уже существует
    var curTask = getActivity(card.TopElem.tasks, params.task_id)
    if (curTask != undefined) {
        // повторно не добавляем
        return false
    }

    var id, task
    for (id in params.tasks) {
        task = getActivity(card.TopElem.tasks, id)
        if (task == undefined) {
            continue
        }

        if (task.status == "passed") {
            return false
        }
    }

    return true
}

/**
 * Обрабатывает адаптации, добавляя программу обучения.
 */
function main(params) {
    var adaptations = getAdaptations()
    if (ArrayOptFirstElem(adaptations) == undefined) {
        addLog("Не найдено активных адаптаций.")
        return null
    }

    var defTask = getDefTask(params)
    if (defTask == null) {
        addLog("Не найдена активность в типовой программе")
        return null
    }

    var adaptation, res, card
    for (adaptation in adaptations) {
        card = tools.open_doc(adaptation.id)
        if (card == undefined) {
            addLog("Адаптация " + adaptation.id + " не изменена. code: 0")
            continue
        }

        if ( !check(card, params) ) {
            addLog("Адаптация " + adaptation.id + " не изменена. code: 1")
            continue
        }

        res = addEducationMethod(card, params, defTask) // добавить активность
        if (res == null) {
            addLog("Адаптация " + adaptation.id + " не изменена. code: 2")
            continue
        }

        addLog("Адаптация " + adaptation.id + " изменена.")
    }
}

try {
    addLog('begin')

    var params = {
        stage_id: "5ji6zf", //идентификатор этапа, куда будет добавлена активность
        task_id:  "cognnv", //идентификатор активности, которую нужно добавить
        def_prog_id: "7091183048256786762", //идентификатор типовой программы

        // активности которые могут быть успешно завершены
        tasks: ["aqvq3k","0kbxdu"], 
    }

    main(params)

    addLog('end')
}
catch(err) {
    addLog(err)
}

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
 * Находит активность в списке задач по указанному ID.
 * @param {Array<object>} tasks - Список активностей.
 * @param {string} id - ID для поиска активности.
 * @returns {object|undefined} Найденный объект активности или undefined.
 */
function getActivity(tasks, id) {
    var sWhere = "StrBegins(String(This.id), '" + id + "', true)"

    return ArrayOptFind(tasks, sWhere)
}

function check(card, params) {
    var task = getActivity(card.TopElem.tasks, params.task_id)
    if (task == undefined) {
        return false
    }

    if (task.status == "passed") {
        return false
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

        LIB.deleteOnlyTask({
            adaptation_id: adaptation.id,
            stage_id: params.task_id,
        })

        addLog("Адаптация " + adaptation.id + " изменена.")
    }
}

try {
    addLog('begin')

    var PATH = "x-local://wt/web/custom_projects/libs/adaptation_lib.js"
    var LIB = OpenCodeLib(PATH).clear()
    var params = {
        //task_id:  "aqvq3k", //идентификатор активности, которую нужно удалить
        task_id:  "0kbxdu", //идентификатор активности, которую нужно удалить
        def_prog_id: "7091183048256786762", //идентификатор типовой программы
    }

    main(params)

    addLog('end')
}
catch(err) {
    addLog(err)
}

/**
 * Логирование
 * @param {string} value - значение для логирования
 * @param {string} name - название файла лога
 */
function addLog(value, name) {
    var sLogName = name
    if (sLogName == undefined) {
        sLogName = "load_sc_from_typical_adapt"
    }

    EnableLog(sLogName)
    LogEvent(sLogName, value)
}

/**
 * Получить библиотеку для работы с SkillCup
 * @returns {XmElem}
 */
function getSkillCupLib() {
    var sc_path = 'x-local://wt/web/custom_projects/libs/skill_cup_load_lib.js'
    return OpenCodeLib(sc_path)
}

/**
 * Получить библиотеку.
 * Создание завершенного курса из тренинга SkillCup
 * @returns {XmElem}
 */
function getLearningLib() {
    var learning_path = 'x-local://wt/web/custom_projects/libs/learning_lib.js'
    return OpenCodeLib(learning_path)
}

/**
 * Получить библиотеку для работы с адаптациями
 * @returns {XmElem}
 */
function getAdaptationLib() {
    var adaptation_path = 'x-local://wt/web/custom_projects/razum_common/'
    return OpenCodeLib(adaptation_path + 'razum_common_lib.js')
}

/**
 * Извлекает коды, начинающиеся с "SC_", из списка задач.
 * @param {object} tasks - Список объектов задач для обработки.
 * @returns {object} Объект с уникальными кодами "SC_" в качестве ключей.
 */
function getScLearnings(res, tasks) {
    var task, code
    for (task in tasks) {
        try {
            code = String(task.object_id.ForeignElem.code)
        } catch (err) {
            continue
        }

        if ( !StrBegins(code, "SC_") ) {
            continue
        }

        res[code] = true
    }

    return res
}

/**
 * Получает sc-тренинги из адаптаций.
 * @param {array} ids - идентификаторы типовых адаптаций.
 * @returns {object} Объект с уникальными ID sc-тренингов.
 */
function getLearnings(ids) {
    var result = {}

    var id, tasks
    for (id in ids) {
        card = tools.open_doc(id) // открываем адаптацию
        if (card == undefined) {
            continue
        }

        // получаем все курсы из адаптации
        tasks = ArraySelectByKey(card.TopElem.tasks, 'learning', 'type')

        // аккумулируем уникальные идентификаторы sc-тренингов
        result = getScLearnings(result, tasks)
    }

    return result
}

/**
 * Записывает результат успешно выполненного в карточку агента.
 * @param {object} value - Результат выполнения для сохранения.
 */
function writeSuccess(value) {
    var success = tools.object_to_text(value, "json")

    var id = oData.id
    var card = tools.open_doc(Int(id))
    card.TopElem.custom_elems.ObtainChildByKey('success').value = success
    card.Save()
}

/**
 * Загружает курсы SkillCup для указанного сотрудника.
 * @param {object} success - Объект для отслеживания успешных операций.
 * @param {object} person - Объект, представляющий сотрудника.
 * @param {object} learnings - Объект с кодами курсов SkillCup.
 * @param {object} settings - Объект с настройками и библиотеками.
 * @returns {object} Объект `success` с обновленными результатами.
 */
function loadPersonSkillCup(success, person, learnings, settings) {
    var lib = settings.libs.adaptation

    var code, res
    for (code in learnings) {
        addLog(" ")
        addLog("Сотрудник: " + tools.object_to_text(person, "json"))
        addLog("Код sc курса: " + code)

        res = lib.loadScLearning(person.code, code, settings.libs)
        if (res.success) {
            success[person.id + "_" + code] = true
        }

        addLog(tools.object_to_text(res, "json"))
    }

    return success
}

/**
 * Получает список сотрудников из СДО.
 * @returns {Array<object>} Массив объектов сотрудников.
 */
function getPersonsFromLms() {
    var query = (
        "SELECT cs.id, cs.code, cs.fullname \n" +
        "FROM collaborators AS cs \n" +
        "LEFT JOIN positions AS ps ON ps.id = cs.position_id \n" +
        "WHERE cs.is_dismiss = 0  \n" +
        "AND ps.position_common_id in ( \n" +
            "6246751210782330255," +    // СП
            "624675121550118958" +      // ДМ
        ")-- AND cs.code = '444238'"
    )

    return XQuery("sql: " + query)
}

/**
 * Загружает данные SkillCup для списка пользователей.
 * @param {object} settings - Настройки для получения списка пользователей.
 * @returns {void}
 */
function load(settings) {
    var success = {}

    addLog("Получение списка сотрудников.")
    var persons = getPersonsFromLms()
    if (ArrayOptFirstElem(persons) == undefined) {
        return
    }

    addLog("Получение списка активностей.")
    var learnings = getLearnings(settings.programs)

    addLog("Обработка активностей по каждому сотруднику.")
    var person
    for (person in persons) {
        success = loadPersonSkillCup(success, person, learnings, settings)
    }

    writeSuccess(success)
}




// entry point
try {
    addLog("begin")
    load({
        libs: {
            sc: getSkillCupLib(),
            learning: getLearningLib(),
            adaptation: getAdaptationLib(),
        },
        programs: [7231245838301082062],
    })
    addLog("end")
} catch (err) {
    addLog("ERROR: " + err)
}


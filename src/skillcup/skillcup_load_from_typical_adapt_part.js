/**
 * Логирование
 * @param {string} value - значение для логирования
 * @param {string} name - название файла лога
 */
function addLog(value, name) {
    var sLogName = name
    if (sLogName == undefined) {
        sLogName = "skillcup_load_from_typical_adapt_part"
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
    DropFormsCache(sc_path)
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
 * Получает и анализирует JSON-данные из элемента 'success' документа.
 * @returns {object} Разобранные JSON-данные из элемента 'success'.
 */
function getSuccess() {

    // в этом агенте хранятся успешно загруженные тренировки
    //var id = 7268461818169353041
    var id = "7268813426643136606"
    var card = tools.open_doc(Int(id))
    var success = card.TopElem.custom_elems.ObtainChildByKey('success').value

    try {
        return ParseJson(success)
    } catch(err) {}

    return null
}

function loadPersonSkillCup(success, person, learnings, settings) {
    var lib = settings.libs.adaptation
    var sc = settings.libs.sc

    // получить тренировки за последние 5 дней
    var trainings = sc.loadTrainingsForUser(person.code, 'monobrand', 5)
    if ( !trainings.success ) {
        return
    }

    var training, res, code
    for (training in trainings.data.trainings) {
        code = "SC_monobrand_" + training.content.id

        // пропустить тренинг, если его нет типовой программе адаптации
        if (learnings.GetOptProperty(code) == undefined) {
            continue
        }

        // пропустить тренинг, если если он уже был загружен при полной загрузке
        if (success.GetOptProperty(person.id + "_" + code, false)) {
            addLog(" ")
            addLog("Сотрудник: " + tools.object_to_text(person, "json"))
            addLog("success: " + code)
            continue
        }

        addLog(" ")
        addLog("Сотрудник: " + tools.object_to_text(person, "json"))
        addLog("Код sc тренинга: " + code)

        //res = lib.loadScLearning(person.code, code, settings.libs)

        addLog(tools.object_to_text(res, "json"))
    }
}

/**
 * Получает список сотрудников из СДО.
 * @returns {Array<object>} Массив объектов сотрудников.
 */
function getPersonsFromLms() {
    var query = (
        "SELECT top 2000 cs.id, cs.code, cs.fullname \n" +
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
    addLog("Получение списка сотрудников.")
    var persons = getPersonsFromLms()
    if (ArrayOptFirstElem(persons) == undefined) {
        return
    }

    addLog("Получение списка активностей.")
    var learnings = getLearnings(settings.programs)

    var success = getSuccess()
    if (success == null) {
        addLog("Не найдены завершенные тренинги. Загружаем не фильтруя.")
    }

    addLog("learnings: " + tools.object_to_text(learnings, "json"))
    addLog("success: " + tools.object_to_text(success, "json"))

    addLog("Обработка активностей по каждому сотруднику.")
    var person
    for (person in persons) {
        loadPersonSkillCup(success, person, learnings, settings)
    }
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


# 📖 Справка по управлению проектом InfraWatch

## ⚡ Самое главное

Вместо `make start` используйте **`infrawatch start`**

Вместо `make status` используйте **`infrawatch status`**

## 🔥 Основные команды

```bash
infrawatch setup      # Первичная настройка (запустить один раз)
infrawatch start      # Запустить все сервисы
infrawatch status     # Проверить статус сервисов
infrawatch logs       # Просмотреть логи
infrawatch stop       # Остановить все сервисы
```

## 📋 Все команды

**Запуск/Остановка:**
- `infrawatch start` - Запустить
- `infrawatch stop` - Остановить  
- `infrawatch restart` - Перезагрузить
- `infrawatch status` - Статус

**Установка:**
- `infrawatch setup` - Полная настройка
- `infrawatch install` - Установить зависимости
- `infrawatch install-backend` - Backend зависимости
- `infrawatch install-frontend` - Frontend зависимости
- `infrawatch install-agent` - Agent зависимости

**Логи:**
- `infrawatch logs` - Все логи
- `infrawatch logs backend` - Backend логи
- `infrawatch logs frontend` - Frontend логи
- `infrawatch logs agent` - Agent логи

**Разработка:**
- `infrawatch dev` - Быстрый старт
- `infrawatch build-agent` - Сборка agent
- `infrawatch deploy` - Docker развёртывание

**Очистка:**
- `infrawatch clean` - Очистить кеш
- `infrawatch clean --all` - Полная очистка

**Информация:**
- `infrawatch version` - Версия
- `infrawatch info` - Информация проекта
- `infrawatch --help` - Полная справка

## 🎯 Типичные сценарии

### Первый раз
```bash
infrawatch setup      # Установить всё
infrawatch start      # Запустить
```

### Обычная работа
```bash
infrawatch start      # Запуск
infrawatch status     # Проверка
infrawatch logs       # Мониторинг
# ... работа ...
infrawatch stop       # Остановка
```

### Если что-то сломалось
```bash
infrawatch status     # Что работает?
infrawatch logs       # Какие ошибки?
infrawatch restart    # Перезагрузить
infrawatch clean --all && infrawatch setup  # С нуля
```

## 💡 Совет

Работайте из любой директории - команда автоматически найдёт проект!

```bash
infrawatch status          # Работает отсюда
cd /tmp && infrawatch logs # И отсюда тоже!
```

## 📚 Подробная документация

- `CLI_GUIDE.md` - Полная справка
- `INFRAWATCH_CLI.md` - Подробное руководство

---

**Всё работает!** Начните с `infrawatch setup`

# Production backup и мониторинг

## Ежедневный backup

Workflow `.github/workflows/backup-production.yml` каждый день в 04:17 по Москве:

1. запускает `pg_dump` на production-сервере по существующему защищённому SSH-доступу;
2. там же шифрует поток AES-256, поэтому незашифрованная база не покидает российский сервер;
3. передаёт GitHub runner только зашифрованный файл и загружает его вместе с SHA-256 в Timeweb S3;
4. скачивает объект обратно;
5. проверяет checksum и передаёт зашифрованный поток обратно на production;
6. на production расшифровывает его во временную отдельную базу, проверяет таблицы и удаляет тестовую базу;
7. помечает backup успешным только после проверки таблиц;
8. удаляет S3-объекты старше 30 дней.

Нужные secrets окружения GitHub `production`:

- `BACKUP_S3_BUCKET`;
- `BACKUP_S3_ACCESS_KEY`;
- `BACKUP_S3_SECRET_KEY`.

Фраза шифрования не хранится в GitHub. Рабочая копия находится только на production в
`/opt/kodpauza/.backup-encryption-passphrase`; резервная локальная копия хранится в корне проекта
в `backup-encryption-passphrase`, исключена из Git и должна иметь права `600`. Эту резервную копию
также необходимо сохранить в менеджере паролей: без неё dump невозможно восстановить.

`deploy/configure-backup-secrets.sh` устанавливает S3 secrets в GitHub, а фразу шифрования — напрямую
на production через SSH, после чего запускает workflow вручную.

Перед запуском настройщика задайте `BACKUP_PROD_HOST` в окружении. Адрес сервера и имя бакета
не хранятся в исходниках; настройщик запрашивает имя бакета без вывода введённого значения.

Общие S3-параметры зафиксированы в workflow; имя бакета берётся из secret:

- endpoint: `https://s3.twcstorage.ru`;
- bucket: `BACKUP_S3_BUCKET`;
- region: `ru-1`;
- prefix: `kodpauza/postgres/`.

## Мониторинг

`deploy/monitor-production.sh` выполняется на production каждые пять минут и дедуплицирует уведомления. Проверяются:

- readiness API;
- заполнение корневого диска (порог 85%);
- незавершённый или устаревший backup;
- ошибки операций и webhook ЮKassa в логах API;
- пять и более антифрод-сигналов за 15 минут.

После устранения проблемы приходит отдельное сообщение о восстановлении.

Ручная проверка:

```bash
ssh kodpauza
sudo -u deploy /home/deploy/monitor-production.sh
sudo -u deploy crontab -l
```

Ручной запуск backup выполняется на вкладке GitHub Actions → `Backup production PostgreSQL` → `Run workflow`.

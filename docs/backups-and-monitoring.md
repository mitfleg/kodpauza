# Production backup и мониторинг

## Ежедневный backup

Workflow `.github/workflows/backup-production.yml` каждый день в 04:17 по Москве:

1. получает PostgreSQL dump по существующему защищённому SSH-доступу;
2. шифрует его AES-256 до отправки во внешнее хранилище;
3. загружает dump и SHA-256 в Timeweb S3;
4. скачивает объект обратно;
5. проверяет checksum, расшифровывает и восстанавливает в чистый PostgreSQL 16;
6. помечает backup успешным только после проверки таблиц;
7. удаляет S3-объекты старше 30 дней.

Нужные secrets окружения GitHub `production`:

- `BACKUP_S3_ACCESS_KEY`;
- `BACKUP_S3_SECRET_KEY`;
- `BACKUP_ENCRYPTION_PASSPHRASE` — минимум 32 символа.

Фразу шифрования необходимо хранить вне сервера и GitHub, например в менеджере паролей. Без неё dump невозможно восстановить.
Локальная копия хранится в корне проекта в `backup-encryption-passphrase`, исключена из Git и должна иметь права `600`.

S3-параметры зафиксированы в workflow:

- endpoint: `https://s3.twcstorage.ru`;
- bucket: `example-backup-bucket`;
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

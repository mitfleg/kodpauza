# API

Локальный base URL: `http://localhost:4000`. Защищенные маршруты используют `Authorization: Bearer <jwt>`. JSON-схемы строгие: неизвестные поля отклоняются.

## Состояние

- `GET /health` - liveness процесса.
- `GET /ready` - готовность API и соединения с PostgreSQL.

## Авторизация

- `POST /v1/auth/register` - регистрация `developer` или `advertiser`; вместе с данными передается одноразовый `captchaToken` от Yandex SmartCaptcha;
- `POST /v1/auth/verify-email` - подтверждение шестизначным одноразовым кодом;
- `POST /v1/auth/resend-verification` - повторная отправка кода с cooldown;
- `POST /v1/auth/login` - вход.
- `GET /v1/auth/me` - безопасный профиль без ключа подписи событий.

Пароль: от 10 символов и не более 72 байт UTF-8. Email нормализуется в нижний регистр, точные повторы запрещены уникальным индексом, временные домены отклоняются сервером. Публичная регистрация администратора запрещена. Регистрация возвращает `verificationRequired: true`, но не JWT и не `eventSecret`. До подтверждения почты обычный вход, вход расширения, refresh и все защищенные маршруты недоступны. Код хранится только как HMAC-хеш, ограничен сроком и числом попыток. После подтверждения API активирует аккаунт и возвращает JWT; разработчик также получает `eventSecret`, который расширение хранит в VS Code `SecretStorage`.

## Выдача рекламы

`GET /v1/ads/next?surface=<surface>` доступен только разработчику. Codex использует `surface=codex_vscode`, Claude Code - `surface=claude_code_vscode`. Демонстрационного места показа больше нет.

Для подходящей активной кампании API создает серверную запись `AdServe` и возвращает случайный `adId`, `campaignId`, текст, HTTPS-ссылку, формат `standard` или `premium`, запрошенный `surface`, `durationSec`, `trackable: true` и `expiresAt`. Кампания не ограничена конкретной интеграцией; место фактического показа фиксируется в выдаче и событии. Базовый и итоговый CPM, формат, стоимость и вознаграждение фиксируются в выдаче.

Если подходящей кампании нет, API возвращает `204 No Content`. Расширение оставляет штатный индикатор ожидания AI-инструмента и не отправляет события показа.

## События

- `POST /v1/events/impression`;
- `POST /v1/events/click`.

Нужны JWT разработчика и заголовки:

- `X-Kodpauza-Timestamp: <ISO timestamp>`;
- `X-Kodpauza-Signature: sha256=<hmac>`.

HMAC строится из общего `eventSignaturePayload(type, event, timestamp)` и индивидуального `eventSecret`. Событие содержит `eventId`, полученные `adId`/`campaignId`/`surface`, `visibleMs` для показа, версии клиента и инструмента.

Правила:

- событие принимается только для существующей, неистекшей и выданной этому разработчику рекламы;
- одна выдача допускает не более одного показа и одного клика;
- точный повтор того же `eventId` возвращает `200` и `duplicate: true` без второго начисления;
- повтор `eventId` с другим содержимым возвращает `409`;
- новый принятый event возвращает `201`;
- короткий показ возвращает `422`; истекшая выдача - `410`;
- подозрительное событие сохраняется для проверки, но не меняет оплачиваемые счетчики;
- клик не создает вознаграждение.

Чистый показ выполняется одной транзакцией: увеличивает расход и показы кампании, уменьшает баланс рекламодателя, увеличивает баланс разработчика и создает две связанные проводки.

## Рекламодатель

- `GET /v1/advertiser/stats`;
- `GET /v1/advertiser/campaigns` и `GET /v1/advertiser/campaigns/:id`;
- `POST /v1/advertiser/campaigns`;
- `PATCH /v1/advertiser/campaigns/:id`;
- `GET /v1/advertiser/balance` с последними проводками.
- `POST /v1/advertiser/payments` с `amountKopecks` и уникальным `requestId`;
- `GET /v1/advertiser/payments` - последние пополнения;
- `POST /v1/advertiser/payments/:id/refresh` - серверная сверка статуса с ЮKassa.

Новая кампания всегда отправляется на модерацию. URL должен быть HTTPS, минимальный CPM - 2000 копеек (20 рублей), бюджет не может быть меньше уже потраченной суммы или превышать доступный баланс. Изменение параметров активной кампании требует новой модерации.

Сумма пополнения - от 100 до 1 000 000 000 копеек. Redirect пользователя не меняет баланс: зачисление выполняется только после авторитетной проверки объекта платежа через API ЮKassa. Повторный `requestId`, webhook или refresh идемпотентны. Настройка описана в [yookassa.md](yookassa.md).

Публичный маршрут `POST /v1/payments/yookassa/webhook` принимает `payment.succeeded` и `payment.canceled`, но не доверяет телу уведомления и повторно получает платеж у провайдера.

## Разработчик

- `GET /v1/developer/balance`;
- `GET /v1/developer/stats`;
- `GET /v1/developer/events?page=1&pageSize=10` - журнал начислений с пагинацией (`pageSize` от 5 до 50);
- `GET /v1/developer/payouts?page=1&pageSize=10` - балансы, лимиты и история заявок;
- `POST /v1/developer/payouts` с `amountKopecks` и уникальным `requestId` - зарезервировать сумму;
- `POST /v1/developer/payouts/:id/cancel` - отменить необработанную заявку и вернуть резерв;
- `POST /v1/developer/integrations/version-report` - сообщает тип интеграции (`codex` или `claude`), версию инструмента, режим совместимости (`exact`, `structural`, `unsupported`), версию Kodpauza и название редактора;
- `POST /v1/developer/integrations/codex/version-report` - обратная совместимость для расширений Kodpauza до версии 0.5.0.

Ответы не содержат IP/User-Agent хэшей и ключ подписи событий.

## Администратор

- `GET /v1/admin/users`, `/campaigns`, `/payments`, `/payouts`, `/events`, `/fraud-flags`, `/audit-log`, `/finance`;
- `POST /v1/admin/payouts/:id/paid` с уникальным номером фактически выполненного перевода;
- `POST /v1/admin/payouts/:id/reject` с обязательной причиной и автоматическим возвратом резерва;
- `GET /v1/admin/integration-versions` - обнаруженные версии Codex и Claude Code, неподдерживаемые выводятся первыми;
- `POST /v1/admin/integration-versions/:id/acknowledge` - принять новую версию в работу;
- `POST /v1/admin/campaigns/:id/approve`;
- `POST /v1/admin/campaigns/:id/pause`;
- `POST /v1/admin/campaigns/:id/reject` с обязательной причиной.

Одобрить можно только кампанию на модерации с достаточным балансом для первого показа. Решения и подтверждения версий пишутся в `AdminAuditLog`. При первом отчете о неподдерживаемой версии API также создает структурированную запись уровня `warn`. Веб-ответы событий намеренно не включают внутренние антифрод-хэши.

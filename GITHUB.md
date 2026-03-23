# Перенос DierCHAT на GitHub (раздел 49.1)

Я **не могу** удалить ваш старый репозиторий или создать новый от вашего имени — это делается в браузере на [github.com](https://github.com) с вашим аккаунтом.

## Шаги

1. **Создайте** новый репозиторий (например `dier-chat`), без README (пустой).
2. **Удаление старого** (опционально): `Settings` репозитория → внизу `Delete this repository`.
3. В папке проекта на ПК:

```powershell
cd C:\Users\User\Desktop\DierCHAT
git init
git branch -M main
git remote add origin https://github.com/ВАШ_ЛОГИН/dier-chat.git
git add .
git status
```

4. Убедитесь, что **не попали** секреты: в корневом `.gitignore` уже указаны `.env.production`, `config.json`, keystore и т.д. При необходимости: `git reset HEAD путь\к\файлу`.

```powershell
git commit -m "Initial: DierCHAT monorepo"
git push -u origin main
```

Если репозиторий уже с историей и нужна **полная замена** (осторожно):

```powershell
git push --force origin main
```

5. **GitHub Pages**: `Settings` → `Pages` → `Build and deployment` → Source: **GitHub Actions**.  
   В `Settings` → `Secrets and variables` → `Actions` добавьте секреты из `.github/workflows/gh-pages.yml` (минимум `VITE_API_BASE_URL`).  
   При необходимости в **Variables** задайте `VITE_BASE_PATH` (например `/имя-репо/`), если публичный URL не совпадает с именем репозитория.

6. **2FA и branch protection** — включите в `Settings` репозитория и организации.

## Если `git add` падает (Windows) или `push`: «src refspec main does not match any»

- **`Filename too long` в `node_modules`** — в корневом `.gitignore` не должно быть закоммиченных `node_modules` / `dist` / `release`. После правок `.gitignore` выполните:
  - `git config core.longpaths true`
  - `git reset`
  - `git add .`
- **`src refspec main does not match any`** — нет ни одного коммита: сначала успешный `git add .`, затем `git commit -m "..."`, затем `git push -u origin main`.
- **`couldn't find remote ref main`** — на GitHub ещё нет ветки `main`; первый успешный `git push -u origin main` её создаст.

## «not a git repository» и порядок команд

- Сначала **`cd C:\Users\User\Desktop\DierCHAT`**, потом `git status` / `git add` — не из `C:\Windows\System32`.
- Сначала **`git commit`**, потом **`git push`**. Иначе push пишет `src refspec main does not match any`.

## Первый коммит затянул `release/`, `DIERbrowser/bin`, `media/` — как исправить

**Важно:** если тяжёлые файлы уже попали **в коммит**, то новый коммит, который их «удаляет», **не уменьшает** объём при `push` — в истории остаются гигабайты, GitHub часто отвечает `HTTP 500`, `RPC failed`, `Broken pipe` (у вас было **~3.8 GiB**).

**Надёжный способ** (локальные файлы на диске не трогаем, только история git):

```powershell
cd C:\Users\User\Desktop\DierCHAT
Remove-Item -Recurse -Force .git
git init
git branch -M main
git remote add origin https://github.com/AkamiNIGHT/DierCHAT.git
git config core.longpaths true
git config http.postBuffer 524288000
git add .
git status
```

Проверьте в `git status`, что **нет** путей вроде `node_modules`, `DierCHAT-Desktop\release`, `DierCHAT-Server\media`, `DIERbrowser\bin`. Затем:

```powershell
git commit -m "Initial: DierCHAT monorepo"
git push -u origin main --force
```

`--force` нужен, если на GitHub уже была неудачная/частичная попытка.

**Почему не сработало `git reset --soft HEAD~1`:** у **первого (корневого) коммита** нет родителя, поэтому `HEAD~1` не существует — Git и пишет `unknown revision`.

**Папку `.github` в проводнике:** команда `cd .github` или `explorer .github`, а не просто путь в строке PowerShell.

### Если push всё ещё падает

- Повторно проверьте `.gitignore` и `git status`.
- Убедитесь, что в индекс не попал **`DierCHAT-Server/web/`** (вшитая статика) при желании добавьте в `.gitignore` и пересоберите без неё — см. документацию сервера.

## Комментарии в коде на русском

Полная замена комментариев во **всех** файлах — отдельный большой этап. Новые модули (WebRTC ICE, IndexedDB устройств) оформлены блоками на русском. Шаблон для остального: `DierCHAT-Desktop/docs/COMMENTING-RU.md`.

## Бесплатный хостинг

- **Фронт**: GitHub Pages (workflow в этом репозитории).
- **Бэкенд Go + WS**: бесплатные тиры часто **не подходят** для долгих WebSocket; реалистично — VPS в РФ (Timeweb, Selectel) или платный Render/Railway. См. `HOSTING.md`.

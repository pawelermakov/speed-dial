# Search provider fixtures

Public provider responses, collected 2026-10-17

JSON fixtures retain only fields used by parsers, from real responses. No cookies, accounts, request history or credentials are included. Image URLs/descriptions and unrelated fields were removed; adversarial inputs are built separately in tests.

- Yandex: GET `https://suggest.yandex.ru/suggest-sl?part=Матрица`, `text/javascript; charset=UTF-8`, HTTP 200 in isolated Chrome/Firefox extension contexts.
- Google: GET `https://suggestqueries.google.com/complete/search?client=firefox&q=привет мир & C++` (query encoded), `text/javascript; charset=UTF-8`, HTTP 200 in both browsers.
- IMDb: GET `https://v3.sg.media-imdb.com/suggestion/x/Matrix.json`, `application/json; charset=utf-8`, HTTP 200 in both browsers.
- MyShows: POST `https://api.myshows.me/v2/rpc/`, JSON-RPC `shows.Search` with `Breaking Bad` and `Во все тяжкие`. `application/json`, HTTP 200 in Firefox, Node and non-headless Chromium; HeadlessChrome User-Agent produces HTTP 502. The fixture is from Firefox.
- Kinopoisk: POST `https://graphql.kinopoisk.ru/graphql/?operationName=SuggestSearch`, published full operation and public `service-id: 25`, `withUserData:false`. `application/json; charset=utf-8`, HTTP 200 in Node. The fixture is from Node; subsequent live UI checks passed in Chromium and Firefox after installing the narrowly scoped Origin rule.

The Kinopoisk operation/configuration were read from the official page's public runtime configuration and JavaScript (`_app` plus its `SuggestContainer` module). The API rejects modified operations (`the query is not allowed`). No sessions, cookies, proxy or CAPTCHA bypass were used to collect fixtures. The final extension sets Origin only for its own SuggestSearch POST requests, as explicitly authorized by the user.

Verified official search routes: Kinopoisk's visible “Показать все” link uses `/new-search/?text=...`; submitting MyShows' own search form navigated to `/search/?q=...` and showed the matching series. All five providers subsequently passed real UI checks in non-headless Chromium and Firefox (`npm run test:live -- --headed`). Fixtures alone do not prove network access.

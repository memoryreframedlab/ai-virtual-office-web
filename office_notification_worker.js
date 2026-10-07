/*
 * 前面通知専用の同origin service worker。
 *
 * 役割はnotification_bridge.jsがshowNotification()を呼べる場所を提供する
 * ことだけ。push購読・push handler・cacheの作成・fetchの横取り・バック
 * グラウンド同期は一切持たない（第二の通知出口を作らない）。
 */
'use strict';

self.addEventListener('install', function (event) {
	event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
	event.waitUntil(self.clients.claim());
});

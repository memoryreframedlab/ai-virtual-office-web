/*
 * 同origin service worker。前面通知（notification_bridge.jsのshowNotification()
 * 呼び出し場所）と、閉じた画面へのpush配送表示の、両方の出口をここだけで持つ。
 *
 * push購読の開始/解除はnotification_bridge.js側（pushManager.subscribe/
 * getSubscription/unsubscribe）の責務で、ここは一切行わない。ここが持つのは
 * 届いたpushを固定文だけ検証して表示するpush handlerと、固定office originだけを
 * 開くnotificationclick handlerだけ。cacheの作成・fetchの横取り・background
 * syncは一切持たない（第二の通知出口・第二の配送経路を作らない）。
 */
'use strict';

self.addEventListener('install', function (event) {
	event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
	event.waitUntil(self.clients.claim());
});

// gateway/src/notification_push_policy.js の NOTIFY_TITLE/NOTIFY_BODY と同じ
// 固定値（クロス言語importは無いため、ここで固定文字列として写す）。push
// payloadがこの組と一字一句一致しない限り、何も表示しない（攻撃者が購読endpoint
// を知っても任意文面は出せない）。
var FIXED_TITLE = '判断をお願いします';
var FIXED_BODY = '判断が必要です';
// gateway/src/notification_push_policy.js の COMPLETE_TITLE/COMPLETE_BODY と同じ
// 固定値（完了通知）。表示できるのはこの2組のどちらかに一字一句一致する組だけで、
// 組をまたいだ混在（判断titleに完了body等）も自由文も表示しない。
var FIXED_COMPLETE_TITLE = '仕事が完了しました';
var FIXED_COMPLETE_BODY = '完了報告を確認してください';

function isFixedNotificationText(title, body) {
	return (title === 'デザイン担当の通知テスト' && body === '接続確認用です。元の完了通知ではありません')
		|| (title === FIXED_TITLE && body === FIXED_BODY)
		|| (title === FIXED_COMPLETE_TITLE && body === FIXED_COMPLETE_BODY);
}

// Read-only capability handshake before consuming the permanent test.
self.addEventListener('message', function (event) {
	if (event.data === 'resident-notification-test-v1' && event.ports && event.ports[0]) {
		event.ports[0].postMessage('resident-notification-test-v1');
	}
});

self.addEventListener('push', function (event) {
	event.waitUntil(handlePush(event));
});

// 閉じたpayload契約ちょうど：title/body/expires_atの3鍵だけ、他の鍵が
// 1つでも増えていれば（未知field）表示しない。expires_atはgateway側
// （notification_push_payload.js）が元event（source_updated_at）から一度だけ
// 計算した絶対epoch秒で、ここでは絶対に再発行しない。自分のclockと比べて
// 既に過ぎていれば（遅延配送・古いOS通知）表示しない。
var PAYLOAD_KEYS = ['title', 'body', 'expires_at'];

function isValidPushPayload(payload) {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return false;
	}
	var keys = Object.keys(payload);
	if (keys.length !== PAYLOAD_KEYS.length) {
		return false;
	}
	for (var i = 0; i < keys.length; i += 1) {
		if (PAYLOAD_KEYS.indexOf(keys[i]) === -1) {
			return false;
		}
	}
	if (!isFixedNotificationText(payload.title, payload.body)) {
		return false;
	}
	if (typeof payload.expires_at !== 'number' || !isFinite(payload.expires_at) || Math.floor(payload.expires_at) !== payload.expires_at || payload.expires_at < 0) {
		return false;
	}
	return true;
}

function handlePush(event) {
	var payload = null;
	try {
		payload = event.data ? event.data.json() : null;
	} catch (e) {
		return Promise.resolve();
	}
	if (!isValidPushPayload(payload)) {
		return Promise.resolve();
	}
	if (Math.floor(Date.now() / 1000) > payload.expires_at) {
		return Promise.resolve();
	}
	return self.registration.showNotification(payload.title, { body: payload.body })
		.catch(function () {});
}

self.addEventListener('notificationclick', function (event) {
	event.notification.close();
	event.waitUntil(focusOrOpenOffice());
});

// click先はこのservice worker自身のoriginだけ（payload由来のURLは一切使わない）。
function focusOrOpenOffice() {
	var officeUrl = self.location.origin + '/';
	return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
		for (var i = 0; i < list.length; i += 1) {
			if (list[i].url.indexOf(officeUrl) === 0 && typeof list[i].focus === 'function') {
				return list[i].focus();
			}
		}
		if (self.clients.openWindow) {
			return self.clients.openWindow(officeUrl);
		}
		return null;
	}).catch(function () {});
}

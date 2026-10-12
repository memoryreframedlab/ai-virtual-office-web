/*
 * 同originのservice worker（web/office_notification_worker.js）経由の、前面
 * (foreground)通知配送とpush購読開始/解除だけを担うbridge。
 *
 * Godot(src/notification/notification_gateway.gd)側はこの3つの不透明な
 * 入口だけを呼ぶ：
 *   __officeFrontNotifySupported__() -> bool
 *   __officeFrontNotifyDeliver__(requestId, title, body) -> void
 *       （内部で非同期に確定する。戻り値は見ない）
 *   __officeFrontNotifyPoll__(requestId) -> JSON文字列
 *       {"status":"pending"} | {"status":"ok"} |
 *       {"status":"error","safe_error_code":string}
 *
 * push購読はsrc/notification/notification_push_client.gd側がこの4つの
 * 不透明な入口だけを呼ぶ（owner/scope/destination/本文は一切渡さない）：
 *   __officePushSupported__() -> bool
 *   __officePushSubscribe__(requestId, vapidPublicKeyB64Url) -> void
 *   __officePushUnsubscribe__(requestId) -> void
 *   __officePushPoll__(requestId) -> JSON文字列
 *       {"status":"pending"} |
 *       {"status":"ok","subscription":{"endpoint":...,"p256dh":...,"auth":...}} |
 *       {"status":"error","safe_error_code":string}
 * 購読そのもの（endpoint/p256dh/auth）はブラウザのPushManagerが生成するだけで、
 * ここでは一切鍵/文面を作らない。pushイベントの受信・表示・cache・fetch横取り・
 * background syncは一切持たない（それらは同originのservice worker側だけの責務）。
 * 素のNotification constructorへのfallbackも行わない。登録・配送・購読操作に
 * 失敗したら、必ずerrorとして確定させる（pendingのまま固着させない。成功へ変換
 * しない）。
 *
 * register()/readyの待機、およびpush購読/解除の完了待ちには、どれも同じ10秒の
 * 終了境界を設ける。期限後に元の要求が遅れて解決しても、そのrequestIdはすでに
 * errorで確定済みなので、showNotification()もpushManager操作の結果も使わず、
 * 確定した結果を上書きしない。
 */
(function () {
	'use strict';

	var WORKER_URL = 'office_notification_worker.js';
	var READY_TIMEOUT_MS = 10000;
	var _pending = Object.create(null);

	function finish(requestId, status, safeErrorCode) {
		_pending[requestId] = status === 'ok'
			? { status: 'ok' }
			: { status: 'error', safe_error_code: String(safeErrorCode || 'delivery_failed') };
	}

	function hasSupport() {
		return typeof navigator !== 'undefined' && !!navigator && 'serviceWorker' in navigator
			&& typeof window !== 'undefined' && !!window && 'Notification' in window;
	}

	window.__officeFrontNotifySupported__ = function () {
		return hasSupport();
	};

	window.__officeFrontNotifyDeliver__ = function (requestId, title, body) {
		_pending[requestId] = { status: 'pending' };
		try {
			if (!hasSupport()) {
				finish(requestId, 'error', 'notification_unsupported');
				return;
			}
			var timedOut = false;
			var deadline = setTimeout(function () {
				timedOut = true;
				finish(requestId, 'error', 'delivery_failed');
			}, READY_TIMEOUT_MS);
			navigator.serviceWorker.register(WORKER_URL)
				.then(function () {
					return navigator.serviceWorker.ready;
				})
				.then(function (registration) {
					if (timedOut) {
						return null;
					}
					clearTimeout(deadline);
					return registration.showNotification(title, { body: body });
				})
				.then(function () {
					if (timedOut) {
						return;
					}
					clearTimeout(deadline);
					finish(requestId, 'ok', '');
				})
				.catch(function () {
					if (timedOut) {
						return;
					}
					clearTimeout(deadline);
					finish(requestId, 'error', 'delivery_failed');
				});
		} catch (e) {
			clearTimeout(deadline);
			finish(requestId, 'error', 'delivery_failed');
		}
	};

	window.__officeFrontNotifyPoll__ = function (requestId) {
		var entry = _pending[requestId];
		if (!entry) {
			return JSON.stringify({ status: 'error', safe_error_code: 'delivery_failed' });
		}
		if (entry.status !== 'pending') {
			delete _pending[requestId];
		}
		return JSON.stringify(entry);
	};

	// ---- push subscribe/unsubscribe (separate pending map: never shares a
	// requestId namespace with the foreground deliver/poll pair above) ----

	var _pushPending = Object.create(null);

	function finishPush(requestId, status, value) {
		_pushPending[requestId] = status === 'ok'
			? { status: 'ok', subscription: value || null }
			: { status: 'error', safe_error_code: String(value || 'push_failed') };
	}

	function hasPushSupport() {
		return hasSupport() && typeof window.PushManager !== 'undefined';
	}

	// Standard VAPID application-server-key conversion (RFC 8292's public key
	// is base64url; pushManager.subscribe() requires a raw Uint8Array).
	function urlBase64ToUint8Array(base64String) {
		var padding = '='.repeat((4 - base64String.length % 4) % 4);
		var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
		var rawData = window.atob(base64);
		var outputArray = new Uint8Array(rawData.length);
		for (var i = 0; i < rawData.length; ++i) {
			outputArray[i] = rawData.charCodeAt(i);
		}
		return outputArray;
	}

	window.__officePushSupported__ = function () {
		return hasPushSupport();
	};

	// Resolves to the browser's own subscription JSON ({endpoint, p256dh,
	// auth}) -- never anything this bridge itself invents. The caller
	// (notification_push_client.gd) is the only place that ever sends that
	// shape on to the gateway's POST /notifications/push/subscriptions.
	window.__officePushSubscribe__ = function (requestId, vapidPublicKeyB64Url) {
		_pushPending[requestId] = { status: 'pending' };
		var deadline;
		try {
			if (!hasPushSupport() || typeof vapidPublicKeyB64Url !== 'string' || vapidPublicKeyB64Url === '') {
				finishPush(requestId, 'error', 'push_unsupported');
				return;
			}
			var applicationServerKey;
			try {
				applicationServerKey = urlBase64ToUint8Array(vapidPublicKeyB64Url);
			} catch (keyErr) {
				finishPush(requestId, 'error', 'push_key_invalid');
				return;
			}
			var timedOut = false;
			deadline = setTimeout(function () {
				timedOut = true;
				finishPush(requestId, 'error', 'push_subscribe_failed');
			}, READY_TIMEOUT_MS);
			navigator.serviceWorker.register(WORKER_URL)
				.then(function () {
					return navigator.serviceWorker.ready;
				})
				.then(function (registration) {
					if (timedOut) {
						return null;
					}
					return registration.pushManager.subscribe({
						userVisibleOnly: true,
						applicationServerKey: applicationServerKey,
					});
				})
				.then(function (subscription) {
					if (timedOut || !subscription) {
						return;
					}
					clearTimeout(deadline);
					var json = subscription.toJSON();
					var keys = (json && json.keys) || {};
					if (!json || typeof json.endpoint !== 'string' || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
						finishPush(requestId, 'error', 'push_subscribe_failed');
						return;
					}
					finishPush(requestId, 'ok', { endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth });
				})
				.catch(function () {
					if (timedOut) {
						return;
					}
					clearTimeout(deadline);
					finishPush(requestId, 'error', 'push_subscribe_failed');
				});
		} catch (e) {
			clearTimeout(deadline);
			finishPush(requestId, 'error', 'push_subscribe_failed');
		}
	};

	// Always settles 'ok' once the browser-level subscription is gone (or was
	// already absent) -- idempotent, like the gateway's own disable route.
	window.__officePushUnsubscribe__ = function (requestId) {
		_pushPending[requestId] = { status: 'pending' };
		var deadline;
		try {
			if (!hasPushSupport()) {
				finishPush(requestId, 'ok', null);
				return;
			}
			var timedOut = false;
			deadline = setTimeout(function () {
				timedOut = true;
				finishPush(requestId, 'error', 'push_unsubscribe_failed');
			}, READY_TIMEOUT_MS);
			navigator.serviceWorker.register(WORKER_URL)
				.then(function () {
					return navigator.serviceWorker.ready;
				})
				.then(function (registration) {
					return registration.pushManager.getSubscription();
				})
				.then(function (subscription) {
					if (timedOut) {
						return null;
					}
					if (!subscription) {
						return true;
					}
					return subscription.unsubscribe();
				})
				.then(function () {
					if (timedOut) {
						return;
					}
					clearTimeout(deadline);
					finishPush(requestId, 'ok', null);
				})
				.catch(function () {
					if (timedOut) {
						return;
					}
					clearTimeout(deadline);
					finishPush(requestId, 'error', 'push_unsubscribe_failed');
				});
		} catch (e) {
			clearTimeout(deadline);
			finishPush(requestId, 'error', 'push_unsubscribe_failed');
		}
	};

	window.__officePushPoll__ = function (requestId) {
		var entry = _pushPending[requestId];
		if (!entry) {
			return JSON.stringify({ status: 'error', safe_error_code: 'push_failed' });
		}
		if (entry.status !== 'pending') {
			delete _pushPending[requestId];
		}
		return JSON.stringify(entry);
	};
})();

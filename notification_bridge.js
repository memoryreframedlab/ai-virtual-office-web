/*
 * 前面(foreground)通知だけを担う、同originのservice worker経由の配送bridge。
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
 * push購読・push handler・鍵・cache・fetch横取り・画面が閉じている
 * 間に届ける仕組みは一切持たない。素のNotification constructorへの
 * fallbackも行わない。登録・配送に失敗したら、必ずerrorとして確定させる
 * （pendingのまま固着させない。成功へ変換しない）。
 *
 * register()/readyの待機には10秒の終了境界を設ける。期限後に元の要求が
 * 遅れて解決しても、そのrequestIdはすでにerrorで確定済みなので、
 * showNotification()を呼ばず、確定した結果を上書きしない。
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
})();

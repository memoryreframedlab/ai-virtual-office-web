/*
 * Opt-in, native-HTML permission diagnostic. This file must only be loaded by
 * the diagnostic branch of the export shell, never alongside the engine.
 * It observes one explicit browser permission request, with no notification
 * delivery, persistence, reset, or external reporting.
 */
(function () {
	'use strict';

	var FLAG = 'notification_permission_probe';
	var ROOT_ID = 'notification-permission-diagnostic';
	var OBSERVATION_MS = 30000;
	var MAX_ELAPSED_MS = 86400000;
	var rendered = false;
	var values;
	try {
		values = new URLSearchParams(window.location.search).getAll(FLAG);
	} catch (_) {
		return;
	}
	if (values.length !== 1 || values[0] !== '1') {
		return;
	}

	function safely(read, fallback) {
		try {
			return read();
		} catch (_) {
			return fallback;
		}
	}

	function permissionValue(value) {
		return value === 'granted' || value === 'default' || value === 'denied' ? value : 'unknown';
	}

	function booleanValue(value) {
		return value === true ? 'true' : value === false ? 'false' : 'unknown';
	}

	function valueType(value) {
		if (value === null) {
			return 'null';
		}
		var type = typeof value;
		return ['undefined', 'boolean', 'number', 'string', 'bigint', 'symbol', 'object', 'function'].indexOf(type) !== -1
			? type : 'unknown';
	}

	function snapshot() {
		return {
			permission: permissionValue(safely(function () { return window.Notification.permission; }, null)),
			active: booleanValue(safely(function () { return navigator.userActivation.isActive; }, null)),
			beenActive: booleanValue(safely(function () { return navigator.userActivation.hasBeenActive; }, null)),
			secure: booleanValue(safely(function () { return window.isSecureContext; }, null)),
			topLevel: booleanValue(safely(function () { return window.top === window.self; }, null)),
			visibility: safely(function () {
				return document.visibilityState === 'visible' || document.visibilityState === 'hidden'
					? document.visibilityState : 'unknown';
			}, 'unknown')
		};
	}

	function clockNow() {
		var now = safely(function () { return performance.now(); }, null);
		return typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
	}

	function elapsedSince(start) {
		var elapsed = clockNow() - start;
		return Number.isFinite(elapsed) ? Math.min(MAX_ELAPSED_MS, Math.max(0, Math.round(elapsed))) : 0;
	}

	function element(tag, text, parent, id) {
		var node = document.createElement(tag);
		if (text !== null) {
			node.textContent = text;
		}
		if (id) {
			node.id = id;
		}
		if (parent) {
			parent.appendChild(node);
		}
		return node;
	}

	function returnPath() {
		// Keep the remaining query bytes and fragment exactly as they were. A URL
		// reserialization would otherwise change unrelated escaping (e.g. %20).
		var parts = window.location.search.replace(/^\?/, '').split('&');
		var kept = parts.filter(function (part) {
			return !new URLSearchParams(part).has(FLAG);
		});
		var query = kept.join('&');
		// Include the current origin so even a pathname beginning with // cannot
		// become a cross-origin, scheme-relative link.
		return window.location.origin + window.location.pathname + (query ? '?' + query : '') + window.location.hash;
	}

	function render() {
		if (rendered || document.getElementById(ROOT_ID)) {
			return;
		}
		rendered = true;
		document.documentElement.lang = 'ja';
		document.title = '通知許可の単独診断';
		document.body.style.overflow = 'auto';
		document.body.style.touchAction = 'auto';
		document.body.style.height = 'auto';
		document.body.style.minHeight = '100%';
		document.body.style.margin = '0';
		document.body.style.padding = '0';
		document.body.style.font = '16px/1.65 system-ui, sans-serif';
		document.body.style.color = '#172236';
		document.body.style.backgroundColor = '#f4f6fa';
		while (document.body.firstChild) {
			document.body.removeChild(document.body.firstChild);
		}
		var style = element('style',
			'html{overflow:auto;touch-action:auto}body{background:#f4f6fa;color:#172236;font:16px/1.65 system-ui,sans-serif}' +
			'#' + ROOT_ID + '{box-sizing:border-box;max-width:720px;width:100%;margin:0 auto;padding:20px 16px 36px;overflow-wrap:anywhere}' +
			'#' + ROOT_ID + ' *{box-sizing:border-box}' +
			'#' + ROOT_ID + ' h1{font-size:25px;line-height:1.4;margin:0 0 16px}' +
			'#' + ROOT_ID + ' h2{font-size:18px;line-height:1.5;margin:0 0 12px}' +
			'#' + ROOT_ID + ' p{margin:0 0 16px}' +
			'#' + ROOT_ID + ' section{background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:16px;margin:16px 0}' +
			'#' + ROOT_ID + ' dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px 12px;margin:0}' +
			'#' + ROOT_ID + ' dt{font-size:14px;color:#42516a}#' + ROOT_ID + ' dd{margin:0;font-weight:600;word-break:break-word}' +
			'#' + ROOT_ID + ' button,#' + ROOT_ID + ' a{font:inherit;min-height:48px;border-radius:8px;padding:12px 16px}' +
			'#' + ROOT_ID + ' button{display:block;width:100%;border:0;background:#1747ae;color:#fff;cursor:pointer;white-space:normal}' +
			'#' + ROOT_ID + ' button:disabled{background:#53617b;cursor:default}' +
			'#' + ROOT_ID + ' a{display:flex;align-items:center;justify-content:center;color:#143d91;background:#fff;border:1px solid #8496b2;text-decoration:underline}' +
			'#' + ROOT_ID + ' button:focus-visible,#' + ROOT_ID + ' a:focus-visible{outline:3px solid #bd6100;outline-offset:3px}' +
			'#notification-probe-status{font-weight:600}#notification-probe-privacy{font-size:14px;color:#42516a}', document.head);
		style.id = 'notification-permission-diagnostic-style';
		var root = element('main', null, document.body, ROOT_ID);
		element('h1', '通知許可の単独診断', root);
		element('p', 'この画面のボタンを押すと、ブラウザへ通知の許可を1回だけ要求します。許可状態が変わることがあります。', root);
		element('p', '確認画面が表示されない場合もあります。この診断だけで、その理由やブラウザの制限内容は判断できません。', root);
		element('p', '診断結果はこの画面にだけ表示し、保存・送信しません。通知の送信や設定のリセットは行いません。', root, 'notification-probe-privacy');
		var button = element('button', '通知の許可を1回だけ要求する', root, 'notification-probe-request');
		button.type = 'button';
		var status = element('p', 'まだ要求していません。', root, 'notification-probe-status');
		status.setAttribute('role', 'status');
		status.setAttribute('aria-live', 'polite');
		status.style.marginTop = '16px';
		var observationSection = element('section', null, root);
		element('h2', '呼び出しの結果', observationSection);
		var observationList = element('dl', null, observationSection);
		function field(parent, label, id, initial) {
			element('dt', label, parent);
			return element('dd', initial, parent, id);
		}
		var resultState = field(observationList, '結果の状態', 'notification-probe-result-state', 'not_requested');
		var resolvedValue = field(observationList, '解決値（許可の列挙値）', 'notification-probe-resolved-value', 'not_observed');
		var resolvedType = field(observationList, '解決値の型', 'notification-probe-resolved-type', 'not_observed');
		var elapsed = field(observationList, '経過 ms（上限 86,400,000）', 'notification-probe-elapsed-ms', '0');

		function snapshotPanel(title, prefix) {
			var section = element('section', null, root);
			var heading = element('h2', title, section, prefix + '-heading');
			var list = element('dl', null, section);
			var fields = {
				permission: field(list, '通知許可', prefix + '-permission', 'not_observed'),
				active: field(list, '操作中（isActive）', prefix + '-active', 'not_observed'),
				beenActive: field(list, '操作履歴（hasBeenActive）', prefix + '-been-active', 'not_observed'),
				secure: field(list, '安全な接続（secure context）', prefix + '-secure', 'not_observed'),
				topLevel: field(list, '最上位の画面', prefix + '-top-level', 'not_observed'),
				visibility: field(list, '画面の表示状態', prefix + '-visibility', 'not_observed')
			};
			return {
				heading: heading,
				update: function (data) {
					Object.keys(fields).forEach(function (key) { fields[key].textContent = data[key]; });
				}
			};
		}
		var beforePanel = snapshotPanel('現在の環境（要求は未実行）', 'notification-probe-before');
		var afterPanel = snapshotPanel('呼び出し後（まだ未実行）', 'notification-probe-after');
		beforePanel.update(snapshot());
		element('p', 'granted は許可済み、denied は拒否、default は許可未確定です。unknown は値を確認できなかったことを表します。通知の到着は検証していません。', root);
		var returnLink = element('a', '通常画面へ戻る', root, 'notification-probe-return');
		returnLink.href = returnPath();

		var notification = safely(function () { return window.Notification; }, null);
		var request = safely(function () { return notification.requestPermission; }, null);
		if (!notification || typeof request !== 'function') {
			button.disabled = true;
			resultState.textContent = 'unavailable';
			status.textContent = 'この環境では通知許可の要求 API を利用できません。要求は行っていません。';
			return;
		}

		var invoked = false;
		button.addEventListener('click', function (event) {
			if (invoked || !event || event.isTrusted !== true) {
				return;
			}
			invoked = true;
			button.disabled = true;
			button.textContent = '要求済み（再要求はしません）';
			beforePanel.heading.textContent = '呼び出し直前';
			beforePanel.update(snapshot());
			var started = clockNow();
			var settled = false;
			var waited = false;
			var timer = null;
			resultState.textContent = 'pending';
			status.textContent = 'ブラウザの結果を待っています。';

			function finish(kind, value) {
				if (settled) {
					return;
				}
				settled = true;
				if (timer !== null) {
					clearTimeout(timer);
				}
				resultState.textContent = kind;
				elapsed.textContent = String(elapsedSince(started));
				afterPanel.heading.textContent = '呼び出し後（結果受信時）';
				afterPanel.update(snapshot());
				if (kind === 'resolved') {
					resolvedValue.textContent = permissionValue(value);
					resolvedType.textContent = valueType(value);
					status.textContent = (waited ? '30秒経過後に結果を受け取りました。' : '結果を受け取りました。') +
						'解決値: ' + permissionValue(value) + '。通知許可の値は下の「呼び出し後」で確認できます。';
				} else {
					resolvedValue.textContent = 'not_observed';
					resolvedType.textContent = 'not_observed';
					status.textContent = kind === 'rejected'
						? '要求の Promise が reject されました。原因はこの診断だけでは判断できません。'
						: '要求の呼び出しで例外が発生しました。原因はこの診断だけでは判断できません。';
				}
			}

			var result;
			try {
				// Intentionally synchronous in the trusted native click handler.
				// Nothing is awaited or scheduled before this sole API invocation.
				result = request.call(notification);
			} catch (_) {
				finish('sync_throw');
				return;
			}
			timer = setTimeout(function () {
				if (settled) {
					return;
				}
				waited = true;
				resultState.textContent = 'pending_unconfirmed';
				elapsed.textContent = String(elapsedSince(started));
				afterPanel.heading.textContent = '呼び出し後（30秒時点、未確定）';
				afterPanel.update(snapshot());
				status.textContent = '30秒が経過しましたが、結果は未確認です。失敗とは判定していません。再要求は行いません。';
			}, OBSERVATION_MS);
			Promise.resolve(result).then(function (value) {
				finish('resolved', value);
			}, function () {
				finish('rejected');
			});
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', render, { once: true });
	} else {
		render();
	}
})();

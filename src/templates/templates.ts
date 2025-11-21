export const homeTemplate = `<!DOCTYPE html>
<html lang="ja">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>ChaosLT Discord サーバー招待</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: #2c2f33;
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 20px;
		}
		.container {
			background: #36393f;
			border-radius: 8px;
			box-shadow: 0 8px 16px rgba(0,0,0,0.24);
			padding: 40px;
			max-width: 450px;
			width: 100%;
		}
		h1 {
			color: #ffffff;
			margin-bottom: 10px;
			font-size: 24px;
		}
		.subtitle {
			color: #b9bbbe;
			margin-bottom: 24px;
			font-size: 14px;
		}
		.form-group {
			margin-bottom: 20px;
		}
		label {
			display: block;
			color: #b9bbbe;
			margin-bottom: 8px;
			font-weight: 500;
			font-size: 12px;
			text-transform: uppercase;
		}
		input[type="email"] {
			width: 100%;
			padding: 10px;
			background: #202225;
			border: 1px solid #202225;
			border-radius: 3px;
			font-size: 16px;
			color: #dcddde;
			transition: border-color 0.2s;
		}
		input[type="email"]:focus {
			outline: none;
			border-color: #5865f2;
		}
		button {
			width: 100%;
			padding: 12px;
			background: #5865f2;
			color: white;
			border: none;
			border-radius: 3px;
			font-size: 16px;
			font-weight: 600;
			cursor: pointer;
			transition: background 0.2s;
		}
		button:hover {
			background: #4752c4;
		}
		button:active {
			background: #3c45a5;
		}
		button:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
		.info {
			background: #2f3136;
			border-left: 4px solid #5865f2;
			padding: 12px 16px;
			margin-top: 20px;
			border-radius: 4px;
			font-size: 13px;
			color: #b9bbbe;
		}
		.error {
			background: #2f3136;
			border-left: 4px solid #ed4245;
			padding: 12px 16px;
			margin-top: 20px;
			border-radius: 4px;
			font-size: 13px;
			color: #ed4245;
			display: none;
		}
		.loading {
			display: none;
			text-align: center;
			margin-top: 20px;
		}
		.spinner {
			border: 3px solid #2f3136;
			border-top: 3px solid #5865f2;
			border-radius: 50%;
			width: 40px;
			height: 40px;
			animation: spin 1s linear infinite;
			margin: 0 auto;
		}
		@keyframes spin {
			0% { transform: rotate(0deg); }
			100% { transform: rotate(360deg); }
		}
	</style>
</head>
<body>
	<div class="container">
		<h1>Discord サーバー招待</h1>
		<p class="subtitle">筑波大学のメールアドレスで認証してください</p>

		<form id="registerForm">
			<div class="form-group">
				<label for="email">大学メールアドレス</label>
				<input
					type="email"
					id="email"
					name="email"
					placeholder="s1234567@u.tsukuba.ac.jp"
					required
				>
			</div>
			<button type="submit" id="submitBtn">認証して招待リンクを取得</button>
		</form>

		<div class="error" id="errorMsg"></div>
		<div class="loading" id="loading">
			<div class="spinner"></div>
			<p style="margin-top: 10px; color: #b9bbbe;">認証処理中...</p>
		</div>

		<div class="info">
			<strong>注意事項</strong>
			<ul style="margin-top: 8px; margin-left: 20px;">
				<li>筑波大学のメールアドレス (@u.tsukuba.ac.jp) のみ有効</li>
				<li>Microsoft アカウントでの認証が必要です</li>
				<li>招待リンクは5分間・1回のみ有効</li>
			</ul>
		</div>
	</div>

	<script>
		const form = document.getElementById('registerForm');
		const emailInput = document.getElementById('email');
		const submitBtn = document.getElementById('submitBtn');
		const errorMsg = document.getElementById('errorMsg');
		const loading = document.getElementById('loading');

		form.addEventListener('submit', async (e) => {
			e.preventDefault();

			const email = emailInput.value.trim();

			// Show loading
			submitBtn.disabled = true;
			loading.style.display = 'block';
			errorMsg.style.display = 'none';

			try {
				const response = await fetch('/api/register', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ email }),
				});

				const data = await response.json();

				if (!response.ok) {
					throw new Error(data.error || '登録に失敗しました');
				}

				// Redirect to Microsoft login
				window.location.href = data.authUrl;
			} catch (error) {
				showError(error.message);
				submitBtn.disabled = false;
				loading.style.display = 'none';
			}
		});

		function showError(message) {
			errorMsg.textContent = message;
			errorMsg.style.display = 'block';
		}
	</script>
</body>
</html>`;

export const successTemplate = `<!DOCTYPE html>
<html lang="ja">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>認証成功 - Discord招待</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: #2c2f33;
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 20px;
		}
		.container {
			background: #36393f;
			border-radius: 8px;
			box-shadow: 0 8px 16px rgba(0,0,0,0.24);
			padding: 40px;
			max-width: 500px;
			width: 100%;
			text-align: center;
		}
		h1 {
			color: #ffffff;
			margin-bottom: 10px;
			font-size: 24px;
		}
		.welcome {
			color: #b9bbbe;
			margin-bottom: 30px;
			font-size: 16px;
		}
		.invite-link {
			background: #2f3136;
			padding: 16px;
			border-radius: 4px;
			margin-bottom: 20px;
			word-break: break-all;
			font-family: monospace;
			font-size: 14px;
			color: #dcddde;
		}
		.btn {
			display: inline-block;
			padding: 12px 32px;
			background: #5865f2;
			color: white;
			text-decoration: none;
			border-radius: 3px;
			font-size: 16px;
			font-weight: 600;
			transition: background 0.2s;
		}
		.btn:hover {
			background: #4752c4;
		}
		.info {
			background: #2f3136;
			border-left: 4px solid #faa61a;
			padding: 12px 16px;
			margin-top: 20px;
			border-radius: 4px;
			font-size: 13px;
			color: #b9bbbe;
			text-align: left;
		}
	</style>
</head>
<body>
	<div class="container">
		<h1>認証成功</h1>
		<p class="welcome">ようこそ、{{userName}} さん</p>

		<p style="margin-bottom: 16px; color: #b9bbbe;">
			以下のリンクからDiscordサーバーに参加できます：
		</p>

		<div class="invite-link">{{inviteUrl}}</div>

		<a href="{{inviteUrl}}" class="btn" target="_blank">
			Discordサーバーに参加
		</a>

		<div class="info">
			<strong>重要</strong><br>
			この招待リンクは<strong>5分間</strong>のみ有効で、<strong>1回</strong>しか使用できません。<br>
			すぐにサーバーへの参加を完了してください。
		</div>
	</div>
</body>
</html>`;

export const errorTemplate = `<!DOCTYPE html>
<html lang="ja">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>エラー - Discord招待</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: #2c2f33;
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 20px;
		}
		.container {
			background: #36393f;
			border-radius: 8px;
			box-shadow: 0 8px 16px rgba(0,0,0,0.24);
			padding: 40px;
			max-width: 500px;
			width: 100%;
			text-align: center;
		}
		h1 {
			color: #ed4245;
			margin-bottom: 10px;
			font-size: 24px;
		}
		.message {
			color: #b9bbbe;
			margin-bottom: 30px;
			font-size: 16px;
		}
		.btn {
			display: inline-block;
			padding: 12px 32px;
			background: #5865f2;
			color: white;
			text-decoration: none;
			border-radius: 3px;
			font-size: 16px;
			font-weight: 600;
			transition: background 0.2s;
		}
		.btn:hover {
			background: #4752c4;
		}
	</style>
</head>
<body>
	<div class="container">
		<h1>{{title}}</h1>
		<p class="message">{{message}}</p>
		<a href="/" class="btn">トップページに戻る</a>
	</div>
</body>
</html>`;

import { renderHomePage, renderSuccessPage, renderErrorPage } from './lib/templates';
import { saveInviteRecord } from './lib/storage';

interface Env {
	TENANT_ID: string;
	CLIENT_ID: string;
	CLIENT_SECRET: string;
	ALLOWED_DOMAIN: string;
	DISCORD_BOT_TOKEN: string;
	DISCORD_CHANNEL_ID: string;
	INVITES: KVNamespace;
}

interface TokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	scope: string;
	id_token: string;
}

interface UserInfo {
	email: string;
	name: string;
	sub: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		try {
			if (path === '/' && request.method === 'GET') {
				return handleHomePage();
			}

			if (path === '/api/register' && request.method === 'POST') {
				return await handleRegistration(request, env, corsHeaders);
			}

			if (path === '/callback' && request.method === 'GET') {
				return await handleCallback(request, env);
			}

			return new Response('Not Found', { status: 404 });
		} catch (error) {
			console.error('Error:', error);
			return new Response(
				JSON.stringify({ error: 'Internal Server Error', details: error instanceof Error ? error.message : 'Unknown error' }),
				{ status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
			);
		}
	},
} satisfies ExportedHandler<Env>;

function handleHomePage(): Response {
	const html = renderHomePage();

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
		},
	});
}

async function handleRegistration(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
	const body = await request.json() as { email: string };
	const email = body.email?.trim();

	if (!email || !email.endsWith(`@${env.ALLOWED_DOMAIN}`)) {
		return new Response(
			JSON.stringify({ error: `Only @${env.ALLOWED_DOMAIN} emails are allowed` }),
			{ status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
		);
	}

	try {
		const appToken = await getApplicationToken(env);

		await inviteGuestUser(email, env, appToken, request.url);

		const redirectUri = new URL('/callback', request.url).toString();
		const state = crypto.randomUUID();

		const authUrl = new URL(`https://login.microsoftonline.com/${env.TENANT_ID}/oauth2/v2.0/authorize`);
		authUrl.searchParams.set('client_id', env.CLIENT_ID);
		authUrl.searchParams.set('response_type', 'code');
		authUrl.searchParams.set('redirect_uri', redirectUri);
		authUrl.searchParams.set('response_mode', 'query');
		authUrl.searchParams.set('scope', 'openid profile email');
		authUrl.searchParams.set('state', state);
		authUrl.searchParams.set('login_hint', email);

		return new Response(
			JSON.stringify({ authUrl: authUrl.toString() }),
			{ status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
		);
	} catch (error) {
		console.error('Registration error:', error);
		return new Response(
			JSON.stringify({ error: 'Failed to process registration', details: error instanceof Error ? error.message : 'Unknown error' }),
			{ status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
		);
	}
}

async function getApplicationToken(env: Env): Promise<string> {
	const tokenUrl = `https://login.microsoftonline.com/${env.TENANT_ID}/oauth2/v2.0/token`;

	const body = new URLSearchParams({
		client_id: env.CLIENT_ID,
		client_secret: env.CLIENT_SECRET,
		scope: 'https://graph.microsoft.com/.default',
		grant_type: 'client_credentials',
	});

	const response = await fetch(tokenUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: body.toString(),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to get app token: ${error}`);
	}

	const data = await response.json() as TokenResponse;
	return data.access_token;
}

async function inviteGuestUser(email: string, env: Env, accessToken: string, baseUrl: string): Promise<void> {
	const inviteUrl = 'https://graph.microsoft.com/v1.0/invitations';

	const redirectUrl = new URL('/callback', baseUrl).toString();

	const inviteBody = {
		invitedUserEmailAddress: email,
		inviteRedirectUrl: redirectUrl,
		sendInvitationMessage: false,
	};

	const response = await fetch(inviteUrl, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(inviteBody),
	});

	if (!response.ok) {
		const error = await response.text();
		if (response.status === 400 && error.includes('already exists')) {
			console.log('User already invited:', email);
			return;
		}
		throw new Error(`Failed to invite guest user: ${error}`);
	}

	const data = await response.json();
	console.log('Guest user invited:', data);
}


async function handleCallback(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const error = url.searchParams.get('error');
	const errorDescription = url.searchParams.get('error_description');

	if (error) {
		return createErrorPage(`認証エラー: ${error}`, errorDescription || '');
	}

	if (!code) {
		return createErrorPage('認証エラー', '認証コードが見つかりません');
	}

	try {
		const redirectUri = new URL('/callback', request.url).toString();
		const tokenResponse = await exchangeCodeForToken(code, redirectUri, env);

		const userInfo = await getUserInfo(tokenResponse.id_token);

		if (!userInfo.email || !userInfo.email.endsWith(`@${env.ALLOWED_DOMAIN}`)) {
			return createErrorPage(
				'アクセス拒否',
				`このサービスは @${env.ALLOWED_DOMAIN} のメールアドレスのみ利用可能です`
			);
		}

		const inviteUrl = await createDiscordInvite(env);

		await saveInviteRecord(
			env.INVITES,
			userInfo.email,
			userInfo.name || userInfo.email,
			inviteUrl
		);

		return createSuccessPage(userInfo.name || userInfo.email, inviteUrl);
	} catch (error) {
		console.error('Callback error:', error);
		return createErrorPage('エラーが発生しました', error instanceof Error ? error.message : 'Unknown error');
	}
}


async function exchangeCodeForToken(code: string, redirectUri: string, env: Env): Promise<TokenResponse> {
	const tokenUrl = `https://login.microsoftonline.com/${env.TENANT_ID}/oauth2/v2.0/token`;

	const body = new URLSearchParams({
		client_id: env.CLIENT_ID,
		client_secret: env.CLIENT_SECRET,
		code: code,
		redirect_uri: redirectUri,
		grant_type: 'authorization_code',
	});

	const response = await fetch(tokenUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: body.toString(),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to exchange token: ${error}`);
	}

	return await response.json() as TokenResponse;
}


async function getUserInfo(idToken: string): Promise<UserInfo> {

	const parts = idToken.split('.');
	if (parts.length !== 3) {
		throw new Error('Invalid ID token format');
	}

	const payload = parts[1];
	const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
	const binaryString = atob(base64);

	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	const decoder = new TextDecoder('utf-8');
	const decodedPayload = decoder.decode(bytes);

	const claims = JSON.parse(decodedPayload);

	return {
		email: claims.email || claims.preferred_username || claims.upn,
		name: claims.name || claims.given_name || 'User',
		sub: claims.sub || claims.oid,
	};
}

async function createDiscordInvite(env: Env): Promise<string> {
	const response = await fetch(
		`https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/invites`,
		{
			method: 'POST',
			headers: {
				'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				max_age: 300,  // 5 minutes
				max_uses: 1,   // Single use
				temporary: false,
				unique: true,
			}),
		}
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to create Discord invite: ${error}`);
	}

	const data = await response.json() as { code: string };
	return `https://discord.gg/${data.code}`;
}


function createSuccessPage(userName: string, inviteUrl: string): Response {
	const html = renderSuccessPage(userName, inviteUrl);

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
		},
	});
}


function createErrorPage(title: string, message: string): Response {
	const html = renderErrorPage(title, message);

	return new Response(html, {
		status: 400,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
		},
	});
}

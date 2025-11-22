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
			'Access-Control-Allow-Origin': 'https://chaoslt-auth.mizuame.app',
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

	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		console.log('Running scheduled cleanup of pending guest invitations');
		try {
			await cleanupPendingGuests(env);
		} catch (error) {
			console.error('Scheduled cleanup error:', error);
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

		const appToken = await getApplicationToken(env);
		const { userId: guestUserId, redeemUrl } = await inviteGuestUser(email, appToken, authUrl.toString());

		const stateData = JSON.stringify({
			email,
			guestUserId,
		});

		await env.INVITES.put(`state:${state}`, stateData, {
			expirationTtl: 60 * 10, // 10 minutes
		});

		const finalUrl = redeemUrl || authUrl.toString();

		return new Response(
			JSON.stringify({ authUrl: finalUrl }),
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

async function inviteGuestUser(email: string, accessToken: string, authUrl: string): Promise<{ userId: string | null; redeemUrl: string | null }> {
	const inviteUrl = 'https://graph.microsoft.com/v1.0/invitations';

	const inviteBody = {
		invitedUserEmailAddress: email,
		inviteRedirectUrl: authUrl,
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
			return { userId: null, redeemUrl: null };
		}
		throw new Error(`Failed to invite guest user: ${error}`);
	}

	const data = await response.json() as { invitedUser: { id: string }; inviteRedeemUrl: string };
	console.log('Guest user invited:', data);
	return { userId: data.invitedUser.id, redeemUrl: data.inviteRedeemUrl };
}

async function deleteGuestUser(userId: string, env: Env): Promise<void> {
	const appToken = await getApplicationToken(env);
	const deleteUrl = `https://graph.microsoft.com/v1.0/users/${userId}`;

	const response = await fetch(deleteUrl, {
		method: 'DELETE',
		headers: {
			'Authorization': `Bearer ${appToken}`,
		},
	});

	if (!response.ok) {
		const error = await response.text();
		console.error(`Failed to delete guest user ${userId}:`, error);
	} else {
		console.log(`Guest user ${userId} deleted successfully`);
	}
}

async function cleanupPendingGuests(env: Env): Promise<void> {
	const appToken = await getApplicationToken(env);

	const usersUrl = `https://graph.microsoft.com/v1.0/users?$filter=userType eq 'Guest' and externalUserState eq 'PendingAcceptance'&$select=id,mail,createdDateTime,externalUserState`;

	const response = await fetch(usersUrl, {
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${appToken}`,
		},
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to fetch pending guests: ${error}`);
	}

	const data = await response.json() as { value: Array<{ id: string; mail: string; createdDateTime: string; externalUserState: string }> };
	const now = new Date();
	const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

	let deletedCount = 0;

	for (const user of data.value) {
		const createdAt = new Date(user.createdDateTime);

		if (createdAt < fiveMinutesAgo) {
			console.log(`Deleting pending guest: ${user.mail} (created at ${user.createdDateTime})`);
			await deleteGuestUser(user.id, env);
			deletedCount++;
		}
	}

	console.log(`Cleanup complete: ${deletedCount} pending guests deleted`);
}


async function handleCallback(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const error = url.searchParams.get('error');
	const errorDescription = url.searchParams.get('error_description');

	if (error) {
		return createErrorPage(`認証エラー: ${error}`, errorDescription || '');
	}

	if (!code) {
		return createErrorPage('認証エラー', '認証コードが見つかりません');
	}

	if (!state) {
		return createErrorPage('認証エラー', 'セキュリティトークンが見つかりません');
	}

	const storedData = await env.INVITES.get(`state:${state}`);
	if (!storedData) {
		return createErrorPage('認証エラー', 'セキュリティトークンが無効または期限切れです');
	}

	const { email: storedEmail, guestUserId } = JSON.parse(storedData) as { email: string; guestUserId: string | null };

	await env.INVITES.delete(`state:${state}`);

	try {
		const redirectUri = new URL('/callback', request.url).toString();
		const tokenResponse = await exchangeCodeForToken(code, redirectUri, env);

		const userInfo = await getUserInfo(tokenResponse.id_token, env);

		if (!userInfo.email || !userInfo.email.endsWith(`@${env.ALLOWED_DOMAIN}`)) {
			if (guestUserId) {
				await deleteGuestUser(guestUserId, env);
			}
			return createErrorPage(
				'アクセス拒否',
				`このサービスは @${env.ALLOWED_DOMAIN} のメールアドレスのみ利用可能です`
			);
		}

		if (userInfo.email.toLowerCase() !== storedEmail.toLowerCase()) {
			if (guestUserId) {
				await deleteGuestUser(guestUserId, env);
			}
			return createErrorPage(
				'認証エラー',
				'登録したメールアドレスと異なるアカウントでログインしています'
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
		if (guestUserId) {
			await deleteGuestUser(guestUserId, env);
		}
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


async function getUserInfo(idToken: string, env: Env): Promise<UserInfo> {
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

	const expectedIssuer = `https://login.microsoftonline.com/${env.TENANT_ID}/v2.0`;
	if (claims.iss !== expectedIssuer) {
		throw new Error(`Invalid token issuer: expected ${expectedIssuer}, got ${claims.iss}`);
	}

	if (claims.aud !== env.CLIENT_ID) {
		throw new Error(`Invalid token audience: expected ${env.CLIENT_ID}, got ${claims.aud}`);
	}

	const now = Math.floor(Date.now() / 1000);
	if (claims.exp && claims.exp < now) {
		throw new Error('Token has expired');
	}

	if (claims.nbf && claims.nbf > now) {
		throw new Error('Token not yet valid');
	}

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

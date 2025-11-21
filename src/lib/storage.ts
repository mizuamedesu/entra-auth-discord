
export interface InviteRecord {
	email: string;
	userName: string;
	inviteUrl: string;
	createdAt: string;
	expiresAt: string;
}

export async function saveInviteRecord(
	kv: KVNamespace,
	email: string,
	userName: string,
	inviteUrl: string
): Promise<void> {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now

	const record: InviteRecord = {
		email,
		userName,
		inviteUrl,
		createdAt: now.toISOString(),
		expiresAt: expiresAt.toISOString(),
	};

	const key = `invite:${email}:${now.getTime()}`;

	await kv.put(key, JSON.stringify(record), {
		expirationTtl: 60 * 60 * 24 * 7, // 7 days in seconds
	});

	console.log(`Saved invite record: ${key}`);
}


export async function getInviteRecords(
	kv: KVNamespace,
	email: string
): Promise<InviteRecord[]> {
	const prefix = `invite:${email}:`;
	const list = await kv.list({ prefix });

	const records: InviteRecord[] = [];

	for (const key of list.keys) {
		const value = await kv.get(key.name);
		if (value) {
			try {
				records.push(JSON.parse(value) as InviteRecord);
			} catch (error) {
				console.error(`Failed to parse record ${key.name}:`, error);
			}
		}
	}

	return records.sort((a, b) =>
		new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
	);
}


export async function getAllInviteRecords(
	kv: KVNamespace
): Promise<InviteRecord[]> {
	const list = await kv.list({ prefix: 'invite:' });

	const records: InviteRecord[] = [];

	for (const key of list.keys) {
		const value = await kv.get(key.name);
		if (value) {
			try {
				records.push(JSON.parse(value) as InviteRecord);
			} catch (error) {
				console.error(`Failed to parse record ${key.name}:`, error);
			}
		}
	}

	return records.sort((a, b) =>
		new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
	);
}

import { homeTemplate, successTemplate, errorTemplate } from '../templates/templates';


function renderTemplate(template: string, data: Record<string, string>): string {
	let rendered = template;

	for (const [key, value] of Object.entries(data)) {
		const escapedValue = escapeHtml(value);
		const regex = new RegExp(`{{${key}}}`, 'g');
		rendered = rendered.replace(regex, escapedValue);
	}

	return rendered;
}


function escapeHtml(text: string): string {
	const map: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;',
	};
	return text.replace(/[&<>"']/g, (m) => map[m]);
}


export function renderHomePage(): string {
	return homeTemplate;
}


export function renderSuccessPage(userName: string, inviteUrl: string): string {
	return renderTemplate(successTemplate, {
		userName,
		inviteUrl,
	});
}


export function renderErrorPage(title: string, message: string): string {
	return renderTemplate(errorTemplate, {
		title,
		message,
	});
}

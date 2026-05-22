// Netlify Function: createGist
// Expects a POST with JSON body containing the quiz payload (same shape as minimalData)
// Requires a Netlify environment variable named GITHUB_TOKEN with a personal access token

const fetch = global.fetch || require('node-fetch');

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const payload = JSON.parse(event.body || '{}');
        const content = payload || {};

        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured: missing GITHUB_TOKEN' }) };
        }

        const gistBody = {
            description: (content.n || 'Shared Quiz'),
            public: true,
            files: {
                'quiz.json': { content: JSON.stringify(content, null, 2) }
            }
        };

        const resp = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `token ${token}`,
                'User-Agent': 'nodalai-genwebapp'
            },
            body: JSON.stringify(gistBody)
        });

        const data = await resp.json();
        if (!resp.ok) {
            return { statusCode: resp.status || 500, body: JSON.stringify({ error: data }) };
        }

        return { statusCode: 200, body: JSON.stringify({ id: data.id, html_url: data.html_url }) };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message || String(err) }) };
    }
};

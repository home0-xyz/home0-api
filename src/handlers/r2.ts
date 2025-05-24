import type { Env } from '../types/env';

export async function handleR2Test(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'POST' && req.method !== 'GET') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	try {
		const testData = {
			message: 'Hello from R2 bucket test!',
			timestamp: new Date().toISOString(),
			testId: crypto.randomUUID()
		};

		const fileName = `test/bucket-test-${Date.now()}.json`;

		// Test write to R2
		await env.ZILLOW_DATA_BUCKET.put(fileName, JSON.stringify(testData, null, 2), {
			httpMetadata: {
				contentType: 'application/json',
			},
			customMetadata: {
				testType: 'bucket-test',
				createdAt: new Date().toISOString()
			}
		});

		// Test read from R2
		const retrievedObject = await env.ZILLOW_DATA_BUCKET.get(fileName);
		if (!retrievedObject) {
			throw new Error('Failed to retrieve test file from R2');
		}

		const retrievedData = await retrievedObject.json();

		// Test list operation
		const listResult = await env.ZILLOW_DATA_BUCKET.list({ prefix: 'test/' });

		return Response.json({
			success: true,
			message: 'R2 bucket test completed successfully!',
			results: {
				write: 'Success - File written to R2',
				read: 'Success - File read from R2',
				list: `Success - Found ${listResult.objects.length} test files`,
				testFile: fileName,
				testData: retrievedData,
				metadata: retrievedObject.customMetadata
			},
			instructions: {
				listFiles: 'GET /zillow/files',
				downloadFile: `GET /zillow/download?file=${fileName}`,
				cleanup: 'DELETE /r2/cleanup (removes test files)'
			}
		});

	} catch (error) {
		return Response.json({
			success: false,
			error: 'R2 bucket test failed',
			details: error instanceof Error ? error.message : 'Unknown error',
			troubleshooting: [
				'Check that wrangler dev is running with R2 bucket binding',
				'Verify ZILLOW_DATA_BUCKET is properly configured in wrangler.jsonc',
				'Restart wrangler dev if bindings were recently changed'
			]
		}, { status: 500 });
	}
}

export async function handleR2Cleanup(req: Request, env: Env): Promise<Response> {
	if (req.method !== 'POST' && req.method !== 'DELETE') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 });
	}

	try {
		const listResult = await env.ZILLOW_DATA_BUCKET.list({ prefix: 'test/' });
		const deletePromises = listResult.objects.map(obj =>
			env.ZILLOW_DATA_BUCKET.delete(obj.key)
		);

		await Promise.all(deletePromises);

		return Response.json({
			success: true,
			message: `Cleaned up ${listResult.objects.length} test files`,
			deletedFiles: listResult.objects.map(obj => obj.key)
		});

	} catch (error) {
		return Response.json({
			success: false,
			error: 'Cleanup failed',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
}

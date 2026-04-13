import { createClient } from 'npm:@insforge/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
}

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')!
  const apiKey = req.headers.get('X-API-Key') || Deno.env.get('API_KEY')!

  const client = createClient({ baseUrl, apiKey })

  // Find jobs that need processing
  const { data: jobs, error } = await client.database
    .from('extraction_jobs')
    .select('id')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: true })
    .limit(5)

  if (error || !jobs || jobs.length === 0) {
    return jsonResponse({ processed: 0, message: 'No pending jobs' })
  }

  // Invoke process-words for each job
  const results = await Promise.all(
    jobs.map(async (job: { id: string }) => {
      try {
        const resp = await fetch(`${baseUrl}/functions/process-words`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify({ job_id: job.id }),
        })
        const data = await resp.json()
        return { job_id: job.id, ...data }
      } catch (err) {
        return { job_id: job.id, error: String(err) }
      }
    })
  )

  return jsonResponse({ processed: results.length, results })
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

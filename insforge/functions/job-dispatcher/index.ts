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
  const anonKey = Deno.env.get('ANON_KEY')!

  const client = createClient({ baseUrl, anonKey })

  // Find active jobs via SECURITY DEFINER RPC (bypasses RLS)
  const { data: jobs, error } = await client.database.rpc('get_active_extraction_jobs')

  if (error || !jobs || jobs.length === 0) {
    return jsonResponse({
      processed: 0,
      message: 'No pending jobs',
      debug: { error: error?.message },
    })
  }

  // Invoke process-words for each job sequentially via SDK
  const results = []
  for (const job of jobs) {
    try {
      const { data, error: invokeErr } = await client.functions.invoke('process-words', {
        body: { job_id: job.id },
      })
      if (invokeErr) {
        results.push({ job_id: job.id, error: invokeErr.message })
      } else {
        results.push({ job_id: job.id, ...data })
      }
    } catch (err) {
      results.push({ job_id: job.id, error: String(err) })
    }
  }

  return jsonResponse({ processed: results.length, results })
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

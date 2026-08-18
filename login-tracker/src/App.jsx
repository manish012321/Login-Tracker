import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [session, setSession] = useState(null)
  const [logs, setLogs] = useState([])
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)

      if (session) {
        fetchLogs()
        fetchStats()
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)

        if (
          event === 'SIGNED_IN' &&
          sessionStorage.getItem('justSigningIn')
        ) {
          sessionStorage.removeItem('justSigningIn')

          const { error } = await supabase.rpc('record_login')

          if (error) {
            console.error('record_login error:', error)
          }
        }

        if (session) {
          fetchLogs()
          fetchStats()
        } else {
          setLogs([])
          setStats([])
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function fetchLogs() {
    const { data, error } = await supabase
      .from('login_logs')
      .select('email, login_at')
      .order('login_at', { ascending: false })

    if (error) {
      console.error('fetch logs error:', error)
    } else {
      setLogs(data)
    }
  }

  async function fetchStats() {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) return

    const res = await fetch(
      'https://jnkccrahzkclupuxgxyh.supabase.co/functions/v1/get-login-stats',
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    )

    const json = await res.json()

    if (json.stats) {
      setStats(json.stats)
    } else {
      console.error('stats error:', json.error)
    }
  }

  async function signInWithGoogle() {
    sessionStorage.setItem('justSigningIn', '1')

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
        prompt: 'select_account',
      }, 
      }
    })
  }

  async function signOut() {
    await supabase.auth.signOut()
    setLogs([])
    setStats([])
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-400">
      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Login Tracker
          </h1>

          {session && (
            <button
              onClick={signOut}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 transition"
            >
              Sign out
            </button>
          )}
        </header>

        {!session ? (
          /* Login */
          <div className="max-w-md mx-auto mt-20">
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center shadow-sm">

              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Welcome
              </h2>

              <p className="text-gray-500 text-sm mb-6">
                Sign in with Google to view login history
                and statistics.
              </p>

              <button
                onClick={signInWithGoogle}
                className="w-full bg-blue-600 text-white py-2.5 rounded-md font-medium hover:bg-blue-700 transition"
              >
                Sign in with Google
              </button>

            </div>
          </div>
        ) : (
          <>
            {/* User */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-500">
                Signed in as
              </p>

              <p className="font-medium text-gray-900 mt-1">
                {session.user.email}
              </p>
            </div>

            {/* Login History */}
            <section className="bg-white border border-gray-200 rounded-lg mb-6 overflow-hidden">

              <div className="px-5 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  Login History
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">

                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">
                        Email
                      </th>

                      <th className="text-left px-5 py-3 font-medium text-gray-600">
                        Logged in at
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {logs.map((log, i) => (
                      <tr
                        key={i}
                        className="border-t border-gray-100"
                      >
                        <td className="px-5 py-3 text-gray-800">
                          {log.email}
                        </td>

                        <td className="px-5 py-3 text-gray-600">
                          {new Date(log.login_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>

                </table>
              </div>
            </section>

            {/* Login Stats */}
            <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">

              <div className="px-5 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  Login Stats
                </h2>

                <p className="text-sm text-gray-500 mt-1">
                  Data from Supabase Edge Function
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">

                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">
                        Email
                      </th>

                      <th className="text-left px-5 py-3 font-medium text-gray-600">
                        Total Logins
                      </th>

                      <th className="text-left px-5 py-3 font-medium text-gray-600">
                        Last Login
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {stats.map((s, i) => (
                      <tr
                        key={i}
                        className="border-t border-gray-100"
                      >
                        <td className="px-5 py-3 text-gray-800">
                          {s.email}
                        </td>

                        <td className="px-5 py-3 text-gray-800">
                          {s.total_logins}
                        </td>

                        <td className="px-5 py-3 text-gray-600">
                          {new Date(s.last_login).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>

                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

export default App
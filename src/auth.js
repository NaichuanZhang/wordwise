import { insforge } from './insforge-client.js'

export async function signUp(email, password, name) {
  const { data, error } = await insforge.auth.signUp({
    email,
    password,
    name,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function verifyEmail(email, otp) {
  const { data, error } = await insforge.auth.verifyEmail({ email, otp })
  if (error) throw new Error(error.message)
  return data
}

export async function signIn(email, password) {
  const { data, error } = await insforge.auth.signInWithPassword({
    email,
    password,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function signOut() {
  const { error } = await insforge.auth.signOut()
  if (error) throw new Error(error.message)
}

export async function getCurrentUser() {
  const { data, error } = await insforge.auth.getCurrentUser()
  if (error) return null
  return data?.user ?? null
}

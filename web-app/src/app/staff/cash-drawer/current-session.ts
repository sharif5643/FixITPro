import api from '@/lib/api'

/** Id of the open cash-drawer round for this branch. The backend's write endpoints are
 *  /cash-drawer/session/:id/… — the staff pages used to call them without the id. */
export async function currentSessionId(): Promise<string> {
  const session = (await api.get('/cash-drawer/session/current')).data
  if (!session?.id) throw { response: { data: { message: 'ยังไม่มีรอบลิ้นชักที่เปิดอยู่' } } }
  return session.id
}

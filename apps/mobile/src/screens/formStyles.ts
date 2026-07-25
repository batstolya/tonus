import { StyleSheet } from 'react-native'

// One stylesheet for the three auth screens — they are the same form with
// different fields, and drifting styles across them is the usual way a
// sign-in flow starts looking homemade.
export const form = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#fff',
  },
  title: { fontSize: 30, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#d8d8d8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  primary: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#555', paddingVertical: 6, fontSize: 15 },
  hint: { textAlign: 'center', color: '#333', fontSize: 16, lineHeight: 22 },
  error: { color: '#c0362c', fontSize: 14 },
})

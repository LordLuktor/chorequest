import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { requestPasswordReset } from '../../lib/api';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setError('');
    setLoading(true);
    try {
      await requestPasswordReset(trimmed);
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0f0e1a' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingVertical: 48 }}>
          <View style={{ width: '100%', maxWidth: 400 }}>
            {/* Logo */}
            <View style={{ alignItems: 'center', marginBottom: 48 }}>
              <Text style={{ fontSize: 36, fontWeight: '800', color: 'white', letterSpacing: -1 }}>
                Chore<Text style={{ color: '#818cf8' }}>Quest</Text>
              </Text>
              <Text style={{ fontSize: 16, color: '#94a3b8', marginTop: 8 }}>Reset your password</Text>
            </View>

            {sent ? (
              <View style={{ gap: 16 }}>
                <View style={{ padding: 16, borderRadius: 12, backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)' }}>
                  <Text style={{ color: '#4ade80', fontSize: 15, textAlign: 'center', fontWeight: '600', marginBottom: 8 }}>
                    Check your email
                  </Text>
                  <Text style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
                    If an account exists with that email, we sent a link to reset your password. It expires in 1 hour.
                  </Text>
                </View>

                <Pressable
                  onPress={() => { setSent(false); setEmail(''); }}
                  style={{ paddingVertical: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: '#818cf8', fontSize: 14 }}>Send another link</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                <View>
                  <Text style={{ fontSize: 14, color: '#94a3b8', marginBottom: 6 }}>Email Address</Text>
                  <TextInput
                    style={{
                      backgroundColor: '#1a1830',
                      borderWidth: 1,
                      borderColor: '#312e5a',
                      borderRadius: 12,
                      color: '#e0e7ff',
                      fontSize: 16,
                      padding: 14,
                    }}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Enter your email address"
                    placeholderTextColor="#5c6278"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoFocus
                  />
                </View>

                {error ? (
                  <View style={{ padding: 12, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
                    <Text style={{ color: '#f87171', fontSize: 14, textAlign: 'center' }}>{error}</Text>
                  </View>
                ) : null}

                <Pressable
                  onPress={handleSubmit}
                  disabled={loading || !email.trim()}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? '#4338ca' : '#4f46e5',
                    borderRadius: 12,
                    paddingVertical: 16,
                    alignItems: 'center',
                    marginTop: 8,
                    opacity: loading || !email.trim() ? 0.5 : 1,
                  })}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>Send Reset Link</Text>
                  )}
                </Pressable>
              </View>
            )}

            {/* Back to login */}
            <View style={{ marginTop: 32, alignItems: 'center' }}>
              <Link href="/(auth)/login" asChild>
                <Pressable>
                  <Text style={{ color: '#818cf8', fontSize: 14 }}>Back to Sign In</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

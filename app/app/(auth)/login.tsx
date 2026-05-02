import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../providers/AuthProvider';

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!identifier.trim() || !password) return;
    setError('');
    setLoading(true);
    try {
      await login(identifier.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
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
              <Text style={{ fontSize: 16, color: '#94a3b8', marginTop: 8 }}>Sign in to your family</Text>
            </View>

            {/* Form */}
            <View style={{ gap: 16 }}>
              <View>
                <Text style={{ fontSize: 14, color: '#94a3b8', marginBottom: 6 }}>Email or Username</Text>
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
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder="Enter your email or username"
                  placeholderTextColor="#5c6278"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
              </View>

              <View>
                <Text style={{ fontSize: 14, color: '#94a3b8', marginBottom: 6 }}>Password</Text>
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
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor="#5c6278"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {error ? (
                <View style={{ padding: 12, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
                  <Text style={{ color: '#f87171', fontSize: 14, textAlign: 'center' }}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={handleLogin}
                disabled={loading || !identifier.trim() || !password}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? '#4338ca' : '#4f46e5',
                  borderRadius: 12,
                  paddingVertical: 16,
                  alignItems: 'center',
                  marginTop: 8,
                  opacity: loading || !identifier.trim() || !password ? 0.5 : 1,
                })}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>Sign In</Text>
                )}
              </Pressable>
            </View>

            {/* Forgot password */}
            <View style={{ marginTop: 16, alignItems: 'center' }}>
              <Link href="/(auth)/forgot-password" asChild>
                <Pressable>
                  <Text style={{ color: '#94a3b8', fontSize: 13 }}>Forgot password?</Text>
                </Pressable>
              </Link>
            </View>

            {/* Links */}
            <View style={{ marginTop: 24, alignItems: 'center', gap: 12 }}>
              <Link href="/(auth)/signup" asChild>
                <Pressable>
                  <Text style={{ color: '#818cf8', fontSize: 14 }}>Create a new household</Text>
                </Pressable>
              </Link>
              <Link href="/(auth)/join" asChild>
                <Pressable>
                  <Text style={{ color: '#94a3b8', fontSize: 14 }}>
                    Have an invite code? <Text style={{ color: '#818cf8' }}>Join family</Text>
                  </Text>
                </Pressable>
              </Link>
              <Link href="/(auth)/display-login" asChild>
                <Pressable>
                  <Text style={{ color: '#94a3b8', fontSize: 14 }}>
                    Shared screen? <Text style={{ color: '#818cf8' }}>Display Login</Text>
                  </Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

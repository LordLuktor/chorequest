import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../providers/AuthProvider';
import { Monitor } from 'lucide-react-native';

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8', primaryDark: '#4f46e5',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
  success: '#22c55e', danger: '#ef4444',
};

export default function DisplayLoginScreen() {
  const [householdCode, setHouseholdCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { pinLogin } = useAuth();

  const handlePinPress = (digit: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + digit);
      setError('');
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleConnect = async () => {
    if (!householdCode.trim() || pin.length !== 4) return;
    setError('');
    setLoading(true);
    try {
      await pinLogin(householdCode.trim(), pin);
    } catch (err: any) {
      setError(err.message || 'Invalid code or PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit when 4 digits entered
  const handleDigitPress = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError('');
      if (newPin.length === 4 && householdCode.trim()) {
        // Small delay so the UI updates before the request
        setTimeout(() => {
          setLoading(true);
          pinLogin(householdCode.trim(), newPin)
            .catch((err: any) => {
              setError(err.message || 'Invalid code or PIN');
              setPin('');
            })
            .finally(() => setLoading(false));
        }, 100);
      }
    }
  };

  const pinDots = Array.from({ length: 4 }, (_, i) => i < pin.length);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingVertical: 48 }}>
          <View style={{ width: '100%', maxWidth: 400 }}>
            {/* Header */}
            <View style={{ alignItems: 'center', marginBottom: 40 }}>
              <View style={{
                width: 64, height: 64, borderRadius: 32,
                backgroundColor: C.surface3, alignItems: 'center', justifyContent: 'center',
                marginBottom: 16, borderWidth: 1, borderColor: C.border,
              }}>
                <Monitor size={28} color={C.primaryLight} />
              </View>
              <Text style={{ fontSize: 28, fontWeight: '800', color: 'white', letterSpacing: -0.5 }}>
                Display Mode
              </Text>
              <Text style={{ fontSize: 14, color: C.muted, marginTop: 8, textAlign: 'center' }}>
                Connect a shared screen to your household
              </Text>
            </View>

            {/* Household Code Input */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: C.muted, marginBottom: 6 }}>Household Code</Text>
              <TextInput
                style={{
                  backgroundColor: C.card,
                  borderWidth: 1,
                  borderColor: C.border,
                  borderRadius: 12,
                  color: C.text,
                  fontSize: 20,
                  padding: 14,
                  textAlign: 'center',
                  letterSpacing: 4,
                  fontWeight: '600',
                }}
                value={householdCode}
                onChangeText={setHouseholdCode}
                placeholder="Invite code"
                placeholderTextColor={C.dim}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={20}
              />
            </View>

            {/* PIN Display */}
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: C.muted, marginBottom: 12 }}>Enter PIN</Text>
              <View style={{ flexDirection: 'row', gap: 16, marginBottom: 8 }}>
                {pinDots.map((filled, i) => (
                  <View
                    key={i}
                    style={{
                      width: 20, height: 20, borderRadius: 10,
                      backgroundColor: filled ? C.primaryLight : 'transparent',
                      borderWidth: 2,
                      borderColor: filled ? C.primaryLight : C.border,
                    }}
                  />
                ))}
              </View>
            </View>

            {/* Error */}
            {error ? (
              <View style={{
                padding: 12, borderRadius: 8, marginBottom: 16,
                backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
              }}>
                <Text style={{ color: '#f87171', fontSize: 14, textAlign: 'center' }}>{error}</Text>
              </View>
            ) : null}

            {/* Number Pad */}
            <View style={{ gap: 10 }}>
              {[[1, 2, 3], [4, 5, 6], [7, 8, 9]].map((row, ri) => (
                <View key={ri} style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
                  {row.map(num => (
                    <Pressable
                      key={num}
                      onPress={() => handleDigitPress(String(num))}
                      disabled={loading || pin.length >= 4}
                      style={({ pressed }) => ({
                        width: 80, height: 64, borderRadius: 12,
                        backgroundColor: pressed ? C.surface3 : C.card,
                        borderWidth: 1, borderColor: C.border,
                        alignItems: 'center', justifyContent: 'center',
                        opacity: loading || pin.length >= 4 ? 0.5 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 28, fontWeight: '600', color: C.text }}>{num}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
                <View style={{ width: 80, height: 64 }} />
                <Pressable
                  onPress={() => handleDigitPress('0')}
                  disabled={loading || pin.length >= 4}
                  style={({ pressed }) => ({
                    width: 80, height: 64, borderRadius: 12,
                    backgroundColor: pressed ? C.surface3 : C.card,
                    borderWidth: 1, borderColor: C.border,
                    alignItems: 'center', justifyContent: 'center',
                    opacity: loading || pin.length >= 4 ? 0.5 : 1,
                  })}
                >
                  <Text style={{ fontSize: 28, fontWeight: '600', color: C.text }}>0</Text>
                </Pressable>
                <Pressable
                  onPress={handleBackspace}
                  disabled={loading || pin.length === 0}
                  style={({ pressed }) => ({
                    width: 80, height: 64, borderRadius: 12,
                    backgroundColor: pressed ? C.surface3 : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                    opacity: loading || pin.length === 0 ? 0.3 : 1,
                  })}
                >
                  <Text style={{ fontSize: 18, fontWeight: '600', color: C.muted }}>Del</Text>
                </Pressable>
              </View>
            </View>

            {/* Loading indicator */}
            {loading && (
              <View style={{ alignItems: 'center', marginTop: 16 }}>
                <ActivityIndicator color={C.primaryLight} />
              </View>
            )}

            {/* Back link */}
            <View style={{ marginTop: 32, alignItems: 'center' }}>
              <Link href="/(auth)/login" asChild>
                <Pressable>
                  <Text style={{ color: C.muted, fontSize: 14 }}>
                    Back to <Text style={{ color: C.primaryLight }}>Sign In</Text>
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

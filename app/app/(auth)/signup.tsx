import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../providers/AuthProvider';

export default function SignupScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();

  const canSubmit = displayName.trim() && (email.trim() || username.trim()) && password.length >= 8 && householdName.trim();

  const handleSignup = async () => {
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    try {
      await signup({
        displayName: displayName.trim(),
        email: email.trim() || undefined,
        username: username.trim() || undefined,
        password,
        householdName: householdName.trim(),
      });
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-surface-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 justify-center px-8 py-12">
          <View className="items-center mb-10">
            <Text className="text-3xl font-extrabold text-white tracking-tight">Create Your Home</Text>
            <Text className="text-base text-gray-400 mt-2">Set up a new household</Text>
          </View>

          <View className="space-y-3">
            <View>
              <Text className="text-sm text-gray-400 mb-1.5">Your Name</Text>
              <TextInput
                className="w-full px-4 py-3.5 rounded-xl bg-surface-2 border border-primary-950 text-white text-base"
                value={displayName} onChangeText={setDisplayName}
                placeholder="e.g. Scott" placeholderTextColor="#5c6278"
              />
            </View>

            <View className="mt-3">
              <Text className="text-sm text-gray-400 mb-1.5">Household Name</Text>
              <TextInput
                className="w-full px-4 py-3.5 rounded-xl bg-surface-2 border border-primary-950 text-white text-base"
                value={householdName} onChangeText={setHouseholdName}
                placeholder="e.g. The Steinmetz Family" placeholderTextColor="#5c6278"
              />
            </View>

            <View className="mt-3">
              <Text className="text-sm text-gray-400 mb-1.5">Email (optional if username set)</Text>
              <TextInput
                className="w-full px-4 py-3.5 rounded-xl bg-surface-2 border border-primary-950 text-white text-base"
                value={email} onChangeText={setEmail}
                placeholder="you@example.com" placeholderTextColor="#5c6278"
                autoCapitalize="none" keyboardType="email-address"
              />
            </View>

            <View className="mt-3">
              <Text className="text-sm text-gray-400 mb-1.5">Username (optional if email set)</Text>
              <TextInput
                className="w-full px-4 py-3.5 rounded-xl bg-surface-2 border border-primary-950 text-white text-base"
                value={username} onChangeText={setUsername}
                placeholder="e.g. scottstein" placeholderTextColor="#5c6278"
                autoCapitalize="none"
              />
            </View>

            <View className="mt-3">
              <Text className="text-sm text-gray-400 mb-1.5">Password (min 8 characters)</Text>
              <TextInput
                className="w-full px-4 py-3.5 rounded-xl bg-surface-2 border border-primary-950 text-white text-base"
                value={password} onChangeText={setPassword}
                placeholder="Choose a password" placeholderTextColor="#5c6278"
                secureTextEntry
              />
            </View>

            {error ? (
              <View className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <Text className="text-red-400 text-sm text-center">{error}</Text>
              </View>
            ) : null}

            <Pressable
              className="mt-6 py-4 rounded-xl bg-primary-600 items-center active:bg-primary-700"
              onPress={handleSignup} disabled={loading || !canSubmit}
              style={({ pressed }) => ({ opacity: pressed || loading || !canSubmit ? 0.5 : 1 })}
            >
              {loading ? <ActivityIndicator color="white" /> : (
                <Text className="text-white font-semibold text-base">Create Household</Text>
              )}
            </Pressable>
          </View>

          <View className="mt-6 items-center">
            <Link href="/(auth)/login" asChild>
              <Pressable>
                <Text className="text-gray-400 text-sm">
                  Already have an account? <Text className="text-primary-400">Sign in</Text>
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

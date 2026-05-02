import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Home, Calendar, ListChecks, ShoppingCart, Settings, Trophy, DollarSign, Gift } from 'lucide-react-native';
import { getAllowanceSettings } from '../../lib/api';
import { useAuth } from '../../providers/AuthProvider';
import { COLORS } from '../../lib/constants';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === 'web' ? 4 : Math.max(insets.bottom, 4);
  const { member } = useAuth();
  const isDisplay = member?.role === 'display';

  const { data: allowanceSettings } = useQuery({
    queryKey: ['allowanceSettings'],
    queryFn: getAllowanceSettings,
    enabled: !isDisplay,
  });

  const isPointsEconomy = allowanceSettings?.reward_mode === 'points_economy';
  const isEasyMode = member?.easyMode && member?.role !== 'parent';
  const isSimplified = isDisplay || isEasyMode;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primaryLight,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.surface2,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          paddingBottom: bottomPadding,
          paddingTop: 4,
          height: 60 + bottomPadding,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size }) => <Calendar size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, size }) => <ListChecks size={size - 2} color={color} />,
          href: isSimplified ? null : '/tasks',
        }}
      />
      <Tabs.Screen
        name="scores"
        options={{
          title: 'Scores',
          tabBarIcon: ({ color, size }) => <Trophy size={size - 2} color={color} />,
          href: isSimplified ? null : '/scores',
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: 'Rewards',
          tabBarIcon: ({ color, size }) => <Gift size={size - 2} color={color} />,
          href: isSimplified ? null : (isPointsEconomy ? '/rewards' : null),
        }}
      />
      <Tabs.Screen
        name="allowance"
        options={{
          title: 'Allowance',
          tabBarIcon: ({ color, size }) => <DollarSign size={size - 2} color={color} />,
          href: isSimplified ? null : '/allowance',
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Shopping',
          tabBarIcon: ({ color, size }) => <ShoppingCart size={size - 2} color={color} />,
          href: isSimplified ? null : '/map',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size - 2} color={color} />,
          href: isSimplified ? null : '/settings',
        }}
      />
    </Tabs>
  );
}

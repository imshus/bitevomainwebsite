// BiteVo for Android: the same menu, cart, sign-in, orders and wallet as the website, on the same backend.
// Bottom tabs for the main screens; checkout, sign-in, addresses and order pages open on top.
import { StatusBar } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/state/auth';
import { CartProvider, useCart } from './src/state/cart';
import MenuScreen from './src/screens/MenuScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import SignInScreen from './src/screens/SignInScreen';
import { AddressesScreen, AddressFormScreen } from './src/screens/AddressScreens';
import { OrdersScreen, OrderDetailScreen } from './src/screens/OrderScreens';
import { AccountScreen, WalletScreen } from './src/screens/AccountScreens';
import { Home, Receipt, User, Wallet } from './src/components/Icons';
import { C } from './src/theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: C.red, background: C.bg, card: C.white, text: C.ink, border: C.line } };
const header = { headerTintColor: C.ink, headerTitleStyle: { fontWeight: '800' }, headerShadowVisible: false };
const ICONS = { Menu: Home, Orders: Receipt, Wallet, Account: User };

function Tabs() {
  const cart = useCart();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...header,
        tabBarActiveTintColor: C.red,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarIcon: ({ color, size }) => {
          const Icon = ICONS[route.name];
          return <Icon color={color} size={size} />;
        },
      })}
    >
      <Tab.Screen name="Menu" component={MenuScreen} options={{ headerShown: false, tabBarBadge: cart.count || undefined, tabBarBadgeStyle: { backgroundColor: C.red } }} />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: 'My orders' }} />
      <Tab.Screen name="Wallet" component={WalletScreen} options={{ title: 'BiteVo wallet' }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ title: 'My account' }} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <AuthProvider>
        <CartProvider>
          <NavigationContainer theme={theme}>
            <Stack.Navigator screenOptions={header}>
              <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
              <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: 'Checkout' }} />
              <Stack.Screen name="SignIn" component={SignInScreen} options={{ title: 'Sign in', presentation: 'modal' }} />
              <Stack.Screen name="Addresses" component={AddressesScreen} options={{ title: 'Deliver to' }} />
              <Stack.Screen name="AddressForm" component={AddressFormScreen} options={({ route }) => ({ title: route.params?.address ? 'Edit address' : 'Add address' })} />
              <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: 'Your order' }} />
            </Stack.Navigator>
          </NavigationContainer>
        </CartProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { InventoryItem, CATEGORIES } from '../../types';
import { colors, typography, spacing, radius } from '../../theme';

// Shared Components
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';

// Domain Components
import { InventoryItemCard } from '../../components/inventory/InventoryItemCard';
import { InventoryHeader } from '../../components/inventory/InventoryHeader';
import { InventoryFilters } from '../../components/inventory/InventoryFilters';

// Utils
import { mergeInventoryItems, MergedInventoryItem } from '../../utils/inventoryMerge';

// We'll keep the consumption modal logic and edit modal logic here for now, or extract further if needed.
// For brevity in this refactor, I will inline the modals but use the new style tokens.

export default function InventoryScreen() {
  const router = useRouter();

  // Data State
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [displayItems, setDisplayItems] = useState<MergedInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Animations
  const headerOpacity = useRef(new Animated.Value(0)).current;

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expiryFilter, setExpiryFilter] = useState<'all' | 'expiring' | 'expired'>('all');
  const [sortBy, setSortBy] = useState<'expiry' | 'name' | 'category'>('expiry');
  const [showFilters, setShowFilters] = useState(false);

  // Initial Animation
  useEffect(() => {
    Animated.timing(headerOpacity, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  // Sync Display Items
  useEffect(() => {
    if (items.length > 0) {
      const merged = mergeInventoryItems(items);
      setDisplayItems(merged);
    } else {
      setDisplayItems([]);
    }
  }, [items]);

  const fetchInventory = async () => {
    try {
      const data = await api.getInventoryItems();
      setItems(data);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to fetch inventory');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchInventory();
    }, [])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchInventory();
  };

  const handleItemPress = (item: MergedInventoryItem) => {
    router.push({
      pathname: '/edit-item',
      params: { item: JSON.stringify(item) }
    });
  };

  const handleAddItem = () => {
    router.push('/add-item');
  };

  // Helper for counts
  const getDaysUntilExpiry = (expiryDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const statusCounts = useMemo(() => {
    let expired = 0;
    let expiringSoon = 0;
    let fresh = 0;
    items.forEach(item => {
      const days = getDaysUntilExpiry(item.expiry_date);
      if (days < 0) expired++;
      else if (days <= 3) expiringSoon++;
      else fresh++;
    });
    return { expired, expiringSoon, fresh, total: items.length };
  }, [items]);

  // Filter Logic
  const filteredAndSortedItems = useMemo(() => {
    let result = [...displayItems];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(item => item.name.toLowerCase().includes(query));
    }

    if (selectedCategory) {
      result = result.filter(item => item.category.toLowerCase() === selectedCategory.toLowerCase());
    }

    if (expiryFilter !== 'all') {
      result = result.filter(item => {
        const days = getDaysUntilExpiry(item.expiry_date);
        if (expiryFilter === 'expired') return days < 0;
        if (expiryFilter === 'expiring') return days >= 0 && days <= 3;
        return true;
      });
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'category': return a.category.localeCompare(b.category) || new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
        case 'expiry': default: return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
      }
    });

    return result;
  }, [displayItems, searchQuery, selectedCategory, expiryFilter, sortBy]);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory(null);
    setExpiryFilter('all');
    setSortBy('expiry');
  };

  return (
    <Screen safeArea={true} padding={false} style={{ backgroundColor: colors.background.primary }}>
      <Animated.View style={[styles.headerContainer, { opacity: headerOpacity }]}>
        <InventoryHeader statusCounts={statusCounts} />
        {items.length > 0 && (
          <InventoryFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showFilters={showFilters}
            onToggleFilters={() => setShowFilters(!showFilters)}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            expiryFilter={expiryFilter}
            onExpiryFilterChange={setExpiryFilter}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />
        )}
      </Animated.View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary.sage} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="basket-outline" size={64} color={colors.primary.sageLight} />
          </View>
          <Text style={styles.emptyTitle}>Your pantry is empty</Text>
          <Text style={styles.emptySubtext}>Start by adding food items to track freshness.</Text>
          <Button label="Add Your First Item" icon="add" onPress={handleAddItem} />
        </View>
      ) : filteredAndSortedItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={48} color={colors.text.muted} />
          <Text style={[styles.emptyTitle, { fontSize: typography.size.lg, marginTop: spacing.md }]}>No items found</Text>
          <TouchableOpacity onPress={clearFilters} style={{ marginTop: spacing.md }}>
            <Text style={{ color: colors.primary.sage, fontWeight: '600' }}>Clear Filters</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredAndSortedItems}
          keyExtractor={(item) => item.mergedIds.join('-')}
          renderItem={({ item }) => (
            <InventoryItemCard
              item={item}
              onPress={handleItemPress}
              style={{ marginBottom: spacing.md }}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary.sage} />
          }
        />
      )}

      {/* FAB */}
      <View style={styles.fabContainer}>
        <Button
          variant="primary"
          size="lg"
          label=""
          icon="add"
          onPress={handleAddItem}
          style={{ width: 64, height: 64, borderRadius: 32, paddingHorizontal: 0 }}
        />
      </View>

    </Screen>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xs,
    backgroundColor: colors.background.primary,
    zIndex: 10,
  },
  listContent: {
    padding: spacing.base,
    paddingBottom: 100, // For FAB
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.text.secondary,
    marginTop: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyIconContainer: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: colors.primary.sageMuted,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.xl,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily.display,
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    fontFamily: typography.fontFamily.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    maxWidth: 280,
  },
  fabContainer: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.base,
  },
  actionTitle: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  actionSubtitle: {
    fontSize: typography.size.md,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.base,
    height: 48,
    paddingHorizontal: spacing.base,
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.md,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  chip: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
  },
  chipSelected: {
    backgroundColor: colors.primary.sage,
  },
  chipText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.text.primary,
  },
  chipTextSelected: {
    color: colors.text.inverse,
  },
  remainingText: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  quickButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  quickButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.background.secondary,
    minWidth: 56,
    alignItems: 'center',
  },
  quickButtonActive: {
    backgroundColor: colors.primary.sage,
  },
  quickButtonText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  quickButtonTextActive: {
    color: colors.text.inverse,
  },
  consumeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
    gap: spacing.sm,
  },
  consumeInput: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.base,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    textAlign: 'center',
    minWidth: 100,
  },
  consumeInputUnit: {
    fontSize: typography.size.lg,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
});

import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput, ScrollView, Animated, Dimensions, PanResponder, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { MergedInventoryItem } from '../utils/inventoryMerge';
import { CATEGORIES } from '../types';
import { colors, typography, spacing, radius } from '../theme';

// Shared Components
import { Button } from '../components/ui/Button';

type ScreenMode = 'actions' | 'edit' | 'consume';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function EditItemScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [item, setItem] = useState<MergedInventoryItem | null>(() => {
    try {
      if (typeof params.item === 'string') {
        return JSON.parse(params.item);
      }
      return null;
    } catch (e) {
      return null;
    }
  });

  const [mode, setMode] = useState<ScreenMode>('actions');
  const [loading, setLoading] = useState(false);

  // Edit State
  const [editName, setEditName] = useState(item?.name || '');
  const [editCategory, setEditCategory] = useState(item?.category || '');
  const [editQuantity, setEditQuantity] = useState(String(item?.quantity || ''));
  const [editUnit, setEditUnit] = useState(item?.unit || '');
  const [editExpiryDate, setEditExpiryDate] = useState(item?.expiry_date || '');

  // Consume State
  const [consumeQuantity, setConsumeQuantity] = useState(1);

  // Animation
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    openSheet();
  }, []);

  const openSheet = () => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 120,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSheet = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      router.back();
    });
  };

  // Pan responder for drag to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          closeSheet();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 200,
          }).start();
        }
      },
    })
  ).current;

  if (!item) return null;

  // --- Actions ---

  const handleEditSave = async () => {
    setLoading(true);
    try {
      // Update all merged items
      for (const id of item.mergedIds) {
        await api.updateInventoryItem(id, {
          name: editName,
          category: editCategory.toLowerCase(),
          quantity: parseFloat(editQuantity) / item.mergedIds.length,
          unit: editUnit.toLowerCase(),
          storage_location: 'fridge',
          expiry_date: editExpiryDate,
        });
      }
      Alert.alert('Success', 'Item updated', [{ text: 'OK', onPress: closeSheet }]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConsumeSave = async () => {
    setLoading(true);
    try {
      const remaining = item.quantity - consumeQuantity;
      if (remaining <= 0) {
        // Delete all merged items
        await Promise.all(item.mergedIds.map(id => api.deleteInventoryItem(id)));
      } else {
        // Update first item with remaining quantity, delete others if needed
        const firstId = item.mergedIds[0];
        await api.updateInventoryItem(firstId, {
          name: item.name,
          category: item.category.toLowerCase(),
          quantity: remaining,
          unit: item.unit.toLowerCase(),
          storage_location: 'fridge',
          expiry_date: item.expiry_date,
        });
        // Delete other merged items
        for (let i = 1; i < item.mergedIds.length; i++) {
          await api.deleteInventoryItem(item.mergedIds[i]);
        }
      }
      Alert.alert('Success', 'Item updated', [{ text: 'OK', onPress: closeSheet }]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert('Delete', `Delete ${item.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
            setLoading(true);
          try {
            await Promise.all(item.mergedIds.map(id => api.deleteInventoryItem(id)));
            closeSheet();
          } catch (e: any) { 
            Alert.alert('Error', e.message);
            setLoading(false);
          }
        }
      }
    ]);
  };

  const handleBack = () => {
    if (mode !== 'actions') {
      setMode('actions');
    } else {
      closeSheet();
    }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={closeSheet}>
        <Animated.View 
          style={[
            styles.backdrop,
            { opacity: backdropOpacity }
          ]} 
        />
      </TouchableWithoutFeedback>

      {/* Sheet */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY }] }
          ]}
        >
            {/* Header / Drag Handle */}
            <View {...panResponder.panHandlers} style={styles.headerContainer}>
                <View style={styles.handle} />
                <View style={styles.headerContent}>
                    <TouchableOpacity onPress={handleBack} style={styles.headerButton}>
                        {mode !== 'actions' ? (
                            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                        ) : (
                            <Ionicons name="close" size={24} color={colors.text.primary} />
                        )}
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {mode === 'actions' && item.name}
                        {mode === 'edit' && 'Edit Item'}
                        {mode === 'consume' && 'Mark as Consumed'}
                    </Text>
                    <View style={{ width: 40 }} />
                </View>
            </View>

          <ScrollView contentContainerStyle={styles.content}>
            
            {mode === 'actions' && (
              <View style={styles.actionsContainer}>
                <View style={styles.itemInfo}>
                    <Text style={styles.itemQuantity}>{item.quantity} {item.unit}</Text>
                    <Text style={styles.itemCategory}>{item.category}</Text>
                    <Text style={styles.itemExpiry}>Expires: {item.expiry_date}</Text>
                </View>

                <View style={styles.buttonGroup}>
                    <Button label="Edit Item" variant="secondary" onPress={() => setMode('edit')} icon="pencil" />
                    <Button label="Mark as Consumed" variant="primary" onPress={() => {
                        setConsumeQuantity(Math.min(1, item.quantity));
                        setMode('consume');
                    }} icon="checkmark-circle" />
                    <Button label="Delete" variant="danger" onPress={handleDelete} icon="trash" />
                </View>
              </View>
            )}

            {mode === 'edit' && (
              <View style={styles.formContainer}>
                <Text style={styles.inputLabel}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Item name"
                />

                <Text style={styles.inputLabel}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
                  {CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.chip, editCategory.toLowerCase() === cat.toLowerCase() && styles.chipSelected]}
                      onPress={() => setEditCategory(cat)}
                    >
                      <Text style={[styles.chipText, editCategory.toLowerCase() === cat.toLowerCase() && styles.chipTextSelected]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>Quantity</Text>
                <TextInput
                  style={styles.input}
                  value={editQuantity}
                  onChangeText={setEditQuantity}
                  keyboardType="numeric"
                  placeholder="Quantity"
                />

                <Text style={styles.inputLabel}>Unit</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
                  {['Pieces', 'Grams', 'Kilograms', 'Milliliters', 'Liters'].map(unit => (
                    <TouchableOpacity
                      key={unit}
                      style={[styles.chip, editUnit.toLowerCase() === unit.toLowerCase() && styles.chipSelected]}
                      onPress={() => setEditUnit(unit)}
                    >
                      <Text style={[styles.chipText, editUnit.toLowerCase() === unit.toLowerCase() && styles.chipTextSelected]}>
                        {unit}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>Expiry Date</Text>
                <TextInput
                  style={styles.input}
                  value={editExpiryDate}
                  onChangeText={setEditExpiryDate}
                  placeholder="YYYY-MM-DD"
                />

                <View style={{ marginTop: spacing.xl }}>
                    <Button label="Save Changes" variant="primary" onPress={handleEditSave} loading={loading} />
                </View>
              </View>
            )}

            {mode === 'consume' && (
              <View style={styles.formContainer}>
                <Text style={styles.actionSubtitle}>{item.name} • {item.quantity} {item.unit} available</Text>

                {/* Quick percentage buttons */}
                <View style={styles.quickButtons}>
                  {[25, 50, 75, 100].map(percent => (
                    <TouchableOpacity
                      key={percent}
                      style={[
                        styles.quickButton,
                        consumeQuantity === (item.quantity * percent / 100) && styles.quickButtonActive
                      ]}
                      onPress={() => setConsumeQuantity(Math.round(item.quantity * percent / 100 * 10) / 10)}
                    >
                      <Text style={[
                        styles.quickButtonText,
                        consumeQuantity === (item.quantity * percent / 100) && styles.quickButtonTextActive
                      ]}>
                        {percent === 100 ? 'All' : `${percent}%`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Direct quantity input */}
                <View style={styles.consumeInputRow}>
                  <TextInput
                    style={styles.consumeInput}
                    value={String(consumeQuantity)}
                    onChangeText={(text) => {
                      const num = parseFloat(text) || 0;
                      setConsumeQuantity(Math.min(item.quantity, Math.max(0, num)));
                    }}
                    keyboardType="numeric"
                    selectTextOnFocus
                  />
                  <Text style={styles.consumeInputUnit}>{item.unit}</Text>
                </View>

                <Text style={styles.remainingText}>
                  {item.quantity - consumeQuantity <= 0
                    ? 'This will remove the item completely'
                    : `${(item.quantity - consumeQuantity).toFixed(1)} ${item.unit} remaining`}
                </Text>

                <View style={{ marginTop: spacing.xl }}>
                  <Button
                    label={item.quantity - consumeQuantity <= 0 ? 'Remove Item' : 'Confirm'}
                    variant="primary"
                    onPress={handleConsumeSave}
                    loading={loading}
                  />
                </View>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background.card,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    maxHeight: SCREEN_HEIGHT * 0.9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
    paddingBottom: spacing['3xl'],
  },
  headerContainer: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.ui.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ui.border,
    marginBottom: spacing.sm,
  },
  headerContent: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  headerTitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  content: {
    padding: spacing.base,
  },
  actionsContainer: {
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  itemInfo: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  itemQuantity: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  itemCategory: {
    fontSize: typography.size.md,
    color: colors.text.secondary,
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  itemExpiry: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
  },
  buttonGroup: {
    gap: spacing.md,
  },
  formContainer: {
    gap: spacing.sm,
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
  actionSubtitle: {
    fontSize: typography.size.md,
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
  remainingText: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});

import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { RectButton } from 'react-native-gesture-handler';
import { colors, radius, spacing, shadows, typography, getCategoryColor, getCategoryIcon } from '../../theme';
import { MergedInventoryItem } from '../../utils/inventoryMerge';

interface InventoryItemCardProps {
    item: MergedInventoryItem;
    onPress: (item: MergedInventoryItem) => void;
    onDelete?: (item: MergedInventoryItem) => void;
    onEdit?: (item: MergedInventoryItem) => void;
    style?: ViewStyle;
}

export function InventoryItemCard({ item, onPress, onDelete, onEdit, style }: InventoryItemCardProps) {
    const daysUntilExpiry = getDaysUntilExpiry(item.expiry_date);
    const expiryInfo = getExpiryColor(daysUntilExpiry);
    const categoryColor = getCategoryColor(item.category);
    
    // Using simple icons for category visualization
    let categoryIconName = 'ellipse'; 
    try {
        categoryIconName = getCategoryIcon(item.category);
    } catch (e) {
        // Fallback
    }

    const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
        const trans = dragX.interpolate({
            inputRange: [-100, 0],
            outputRange: [1, 0],
            extrapolate: 'clamp',
        });
        
        return (
            <RectButton style={styles.rightAction} onPress={() => onDelete && onDelete(item)}>
                <Animated.View style={[styles.actionIcon, { transform: [{ translateX: trans }] }]}>
                    <Ionicons name="trash-outline" size={24} color="white" />
                    <Text style={styles.actionText}>Delete</Text>
                </Animated.View>
            </RectButton>
        );
    };

    const renderLeftActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
        const trans = dragX.interpolate({
            inputRange: [0, 100],
            outputRange: [0, 1],
            extrapolate: 'clamp',
        });

        return (
            <RectButton style={styles.leftAction} onPress={() => onEdit && onEdit(item)}>
                <Animated.View style={[styles.actionIcon, { transform: [{ translateX: trans }] }]}>
                    <Ionicons name="create-outline" size={24} color="white" />
                    <Text style={styles.actionText}>Edit</Text>
                </Animated.View>
            </RectButton>
        );
    };

    return (
        <Swipeable
            renderRightActions={renderRightActions}
            renderLeftActions={renderLeftActions}
            containerStyle={style}
        >
            <Pressable
                onPress={() => onPress(item)}
                style={({ pressed }) => [
                    styles.container,
                    pressed && styles.pressed,
                ]}
            >
                {/* Category Icon */}
                <View style={[styles.categoryIcon, { backgroundColor: categoryColor + '15' }]}>
                    <Ionicons name={categoryIconName as any} size={22} color={categoryColor} />
                </View>

                {/* Item Info */}
                <View style={styles.content}>
                    <Text style={styles.name} numberOfLines={1}>
                        {item.name}
                    </Text>
                    <View style={styles.metaRow}>
                        <View style={[styles.expiryBadge, { backgroundColor: expiryInfo.background }]}>
                            <View style={[styles.expiryDot, { backgroundColor: expiryInfo.text }]} />
                            <Text style={[styles.expiryText, { color: expiryInfo.text }]}>
                                {expiryInfo.label}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Quantity */}
                <View style={styles.quantityContainer}>
                    <Text style={styles.quantity}>{item.quantity}</Text>
                    <Text style={styles.unit}>{item.unit}</Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color={colors.text.muted} style={{ marginLeft: spacing.sm }} />
            </Pressable>
        </Swipeable>
    );
}

// Helper
const getDaysUntilExpiry = (expiryDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getExpiryColor = (daysUntilExpiry: number) => {
    if (daysUntilExpiry < 0) {
        return { text: colors.status.expired, background: colors.status.expiredBg, label: 'Expired' };
    } else if (daysUntilExpiry <= 2) {
        return { text: colors.status.warning, background: colors.status.warningBg, label: daysUntilExpiry === 0 ? 'Expires today' : `${daysUntilExpiry}d left` };
    } else if (daysUntilExpiry <= 5) {
        return { text: colors.status.caution, background: colors.status.cautionBg, label: `${daysUntilExpiry}d left` };
    } else {
        return { text: colors.status.safe, background: colors.status.safeBg, label: `${daysUntilExpiry}d left` };
    }
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.background.card,
        borderRadius: radius.lg,
        padding: spacing.md,
        ...shadows.base,
    },
    pressed: {
        opacity: 0.95,
        backgroundColor: colors.background.secondary,
    },
    categoryIcon: {
        width: 48,
        height: 48,
        borderRadius: radius.md,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    content: {
        flex: 1,
    },
    name: {
        fontFamily: typography.fontFamily.body,
        fontSize: typography.size.md,
        fontWeight: typography.weight.semibold,
        color: colors.text.primary,
        marginBottom: spacing.xs,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    expiryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: radius.full,
        gap: spacing.xs,
    },
    expiryDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    expiryText: {
        fontFamily: typography.fontFamily.body,
        fontSize: typography.size.xs,
        fontWeight: typography.weight.semibold,
    },
    quantityContainer: {
        alignItems: 'flex-end',
        marginLeft: spacing.md,
    },
    quantity: {
        fontFamily: typography.fontFamily.body,
        fontSize: typography.size.lg,
        fontWeight: typography.weight.bold,
        color: colors.text.primary,
    },
    unit: {
        fontFamily: typography.fontFamily.body,
        fontSize: typography.size.xs,
        color: colors.text.tertiary,
        textTransform: 'lowercase',
    },
    leftAction: {
        flex: 1,
        backgroundColor: colors.primary.sage,
        justifyContent: 'center',
        alignItems: 'flex-start', // Align to left side
        borderRadius: radius.lg,
        marginVertical: 1, // To match card height visuals
    },
    rightAction: {
        flex: 1,
        backgroundColor: colors.status.error,
        justifyContent: 'center',
        alignItems: 'flex-end', // Align to right side
        borderRadius: radius.lg,
        marginVertical: 1,
    },
    actionIcon: {
        width: 80,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
        marginTop: 4,
    }
});

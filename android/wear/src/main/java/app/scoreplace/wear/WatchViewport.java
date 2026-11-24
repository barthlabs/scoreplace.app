package app.scoreplace.wear;

import android.content.Context;
import android.graphics.Insets;
import android.util.AttributeSet;
import android.view.WindowInsets;
import android.widget.FrameLayout;

/** Fits every scroll viewport, including its final resting position, inside the watch face. */
public final class WatchViewport extends FrameLayout {
    public WatchViewport(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override protected void onMeasure(int widthSpec, int heightSpec) {
        int width = MeasureSpec.getSize(widthSpec);
        int height = MeasureSpec.getSize(heightSpec);
        int side = Math.round(4 * getResources().getDisplayMetrics().density);
        int top = side;
        if (getResources().getConfiguration().isScreenRound()) {
            double halfSide = Math.min(width, height) / Math.sqrt(8);
            side = (int) Math.ceil(width / 2.0 - halfSide);
            top = (int) Math.ceil(height / 2.0 - halfSide);
        }
        WindowInsets window = getRootWindowInsets();
        Insets system = window == null ? Insets.NONE : window.getInsets(
                WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
        setPadding(Math.max(side, system.left), Math.max(top, system.top),
                   Math.max(side, system.right), Math.max(top, system.bottom));
        super.onMeasure(widthSpec, heightSpec);
    }
}

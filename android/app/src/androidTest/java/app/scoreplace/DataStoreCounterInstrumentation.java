package app.scoreplace;

import android.app.Activity;
import android.app.Instrumentation;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.util.Log;

import androidx.datastore.core.NativeSharedCounter;

import java.io.File;
import java.io.IOException;

/** Exercises the release APK's JNI in its own process, using only a temporary file. */
public class DataStoreCounterInstrumentation extends Instrumentation {
    @Override
    public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        start();
    }

    @Override
    public void onStart() {
        Bundle result = new Bundle();
        try {
            verifySharedMappings();
            result.putString("counter", "PASS: two mappings observed 0, 1, 2");
            finish(Activity.RESULT_OK, result);
        } catch (Exception | AssertionError | LinkageError error) {
            result.putString("counter", Log.getStackTraceString(error));
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    private void verifySharedMappings() throws IOException {
        System.loadLibrary("datastore_shared_counter");
        NativeSharedCounter counter = new NativeSharedCounter();
        File file = File.createTempFile("datastore-jni", ".counter", getTargetContext().getCacheDir());
        try (ParcelFileDescriptor first = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_WRITE);
             ParcelFileDescriptor second = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_WRITE)) {
            check(counter.nativeTruncateFile(first.getFd()) == 0, "truncate");
            long firstMap = counter.nativeCreateSharedCounter(first.getFd());
            long secondMap = counter.nativeCreateSharedCounter(second.getFd());
            check(firstMap != 0 && secondMap != 0 && firstMap != secondMap, "independent mappings");
            check(counter.nativeGetCounterValue(firstMap) == 0, "initial value");
            check(counter.nativeIncrementAndGetCounterValue(firstMap) == 1, "first increment");
            check(counter.nativeGetCounterValue(secondMap) == 1, "second mapping sees first write");
            check(counter.nativeIncrementAndGetCounterValue(secondMap) == 2, "second increment");
            check(counter.nativeGetCounterValue(firstMap) == 2, "first mapping sees second write");
        } finally {
            check(file.delete(), "remove temporary file");
        }
    }

    private static void check(boolean condition, String operation) {
        if (!condition) throw new AssertionError(operation);
    }
}

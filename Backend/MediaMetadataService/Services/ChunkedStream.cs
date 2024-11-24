using System.Diagnostics;

namespace MediaMetadataService.Services;

/// <summary>
/// Reads a stream in chunks, skipping bytes between chunks
/// </summary>
public sealed class ChunkedStream : Stream {
    private readonly Stream _baseStream;
    private readonly long _chunkSize;
    private readonly long _skipSize;

    private long _currentChunk;

    public ChunkedStream(Stream baseStream, long chunkSize, long skipSize) {
        if (chunkSize < 1) {
            throw new ArgumentOutOfRangeException(nameof(chunkSize), "Value must be greater than 0.");
        }

        if (skipSize < 1) {
            throw new ArgumentOutOfRangeException(nameof(skipSize), "Value must be greater than 0.");
        }

        _baseStream = baseStream;
        _chunkSize = chunkSize;
        _skipSize = skipSize;
    }

    public override bool CanRead {
        get {
            return _baseStream.CanRead;
        }
    }

    public override bool CanSeek {
        get {
            return _baseStream.CanSeek;
        }
    }

    public override bool CanWrite {
        get {
            return false;
        }
    }

    public override long Length {
        get {
            return _baseStream.Length;
        }
    }

    public override long Position {
        get {
            return _baseStream.Position;
        }
        set {
            _baseStream.Position = value;
        }
    }

    public override void Flush() {
        _baseStream.Flush();
    }

    public override int Read(byte[] buffer, int offset, int count) {
        if (_skipSize == 0) {
            return _baseStream.Read(buffer, offset, count);
        }

        Debug.Assert(_currentChunk <= _chunkSize);

        if (_currentChunk == _chunkSize) {
            Seek(_skipSize, SeekOrigin.Current);
            _currentChunk = 0;
        }

        var toRead = (int)Math.Min(count, _chunkSize - _currentChunk);
        var read = _baseStream.Read(buffer, offset, toRead);
        _currentChunk += read;
        return read;
    }

    public override long Seek(long offset, SeekOrigin origin) {
        return _baseStream.Seek(offset, origin);
    }

    public override void SetLength(long value) {
        _baseStream.SetLength(value);
    }

    public override void Write(byte[] buffer, int offset, int count) {
        throw new NotSupportedException();
    }
}
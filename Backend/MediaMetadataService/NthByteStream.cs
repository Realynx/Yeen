namespace MediaMetadataService;

public sealed class NthByteStream : Stream {
    private readonly Stream _baseStream;
    private readonly int _nthByte;

    public NthByteStream(Stream baseStream, int nthByte) {
        _baseStream = baseStream;
        _nthByte = nthByte;
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
        var read = 0;
        for (var i = offset; i < offset + count; i++) {
            var readByte = _baseStream.ReadByte();
            if (readByte == -1) {
                break;
            }

            buffer[i] = (byte)readByte;
            read++;

            Seek(_nthByte - 1, SeekOrigin.Current);
        }

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